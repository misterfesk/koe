import "server-only";
import { z } from "zod";
import { env } from "../env";
import { aiBudgetLeft, recordRun, siteBudgetLeft, type Purpose } from "./usage";

export type { Purpose } from "./usage";

export type ToolCall = { id: string; name: string; args: unknown };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  // An assistant turn that asked for tools has toolCalls (content may be "").
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  // The result of one tool call, answering the assistant's toolCalls[].id.
  | { role: "tool"; toolCallId: string; content: string };

export type Tool = {
  name: string;
  description: string;
  parameters: z.ZodType;
};

export class AiUnavailable extends Error {
  constructor(reason: string) {
    super(`AI unavailable: ${reason}`);
  }
}

// A provider failure. Network errors, timeouts, 5xx and 429 are worth one try
// on the fallback model; other 4xx mean the request itself is wrong.
class ProviderError extends AiUnavailable {
  constructor(
    reason: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(reason);
  }
}

type Options = {
  // Why the call is made: the usage log and cost readout group by this.
  purpose: Purpose;
  // Whose request this is. Counts against their daily budget; omit for operator calls.
  userId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  // Name for the JSON schema sent to the provider (completeJson only).
  schemaName?: string;
  // A further check on each tool call that passed its schema (completeWithTools
  // only). A call it refuses is dropped and counted with the invalid ones.
  accept?: (call: ToolCall) => boolean;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
};

type WireToolCall = {
  id?: string;
  function?: { name?: string; arguments?: unknown };
};

type WireMessage = {
  content?: string | null;
  tool_calls?: WireToolCall[] | null;
};

type Read<T> = (message: WireMessage) => { value: T; dropped?: number };

function toWire(m: ChatMessage) {
  if (m.role === "tool")
    return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  if (m.role === "assistant" && m.toolCalls?.length)
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
      })),
    };
  return { role: m.role, content: m.content };
}

function usageOf(u: Usage | undefined) {
  return {
    tokensIn: u?.prompt_tokens ?? 0,
    tokensOut: u?.completion_tokens ?? 0,
    cachedIn: u?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

function normalise(error: unknown) {
  if (error instanceof AiUnavailable) return error;
  // A fetch failure, timeout or unreadable body: the model may still be fine.
  return new ProviderError(
    error instanceof Error ? error.message : "network",
    null,
    true,
  );
}

async function guard(options: Options) {
  if (env().KOE_AI === "off")
    throw new AiUnavailable("switched off by operator");
  if (options.userId && (await aiBudgetLeft(options.userId)) <= 0)
    throw new AiUnavailable("daily limit");
  if ((await siteBudgetLeft("ai")) <= 0)
    throw new AiUnavailable("site daily limit");
}

async function post(
  model: string,
  messages: ChatMessage[],
  options: Options,
  extra: Record<string, unknown>,
  stream: boolean,
) {
  const e = env();
  let res: Response;
  try {
    res = await fetch(new URL("chat/completions", e.NEBIUS_BASE_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${e.NEBIUS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: messages.map(toWire),
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 1500,
        stream,
        // Nemotron reasons by default; Koe wants only the answer, fast.
        chat_template_kwargs: { enable_thinking: false },
        ...(stream ? { stream_options: { include_usage: true } } : {}),
        ...extra,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (error) {
    throw normalise(error);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new ProviderError(
      `HTTP ${res.status}`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  }
  return res;
}

/** One non-streaming attempt on one model, logged whether it works or not. */
async function attempt<T>(
  model: string,
  fellBack: boolean,
  messages: ChatMessage[],
  options: Options,
  extra: Record<string, unknown>,
  read: Read<T>,
) {
  const started = Date.now();
  let usage: Usage | undefined;
  let out: { value: T; dropped?: number };
  try {
    const res = await post(model, messages, options, extra, false);
    const body = (await res.json()) as {
      choices?: { message?: WireMessage }[];
      usage?: Usage;
    };
    usage = body.usage;
    out = read(body.choices?.[0]?.message ?? {});
  } catch (error) {
    await recordRun({
      ...usageOf(usage),
      userId: options.userId,
      purpose: options.purpose,
      model,
      latencyMs: Date.now() - started,
      ok: false,
      fellBack,
    });
    throw normalise(error);
  }
  await recordRun({
    ...usageOf(usage),
    userId: options.userId,
    purpose: options.purpose,
    model,
    latencyMs: Date.now() - started,
    ok: true,
    fellBack,
    toolCallsDropped: out.dropped,
  });
  return out.value;
}

/** Primary model first; one retry on the fallback if the provider is unwell. */
async function run<T>(
  messages: ChatMessage[],
  options: Options,
  extra: Record<string, unknown>,
  read: Read<T>,
) {
  await guard(options);
  const e = env();
  const primary = options.model ?? e.KOE_CHAT_MODEL;
  const started = Date.now();
  try {
    return await attempt(primary, false, messages, options, extra, read);
  } catch (error) {
    if (
      !(error instanceof ProviderError) ||
      !error.retryable ||
      e.KOE_FALLBACK_MODEL === primary
    )
      throw error;
    return attempt(
      e.KOE_FALLBACK_MODEL,
      true,
      messages,
      { ...options, timeoutMs: fallbackTimeout(options, started) },
      extra,
      read,
    );
  }
}

// The fallback shares the caller's time budget so a timed-out primary can't
// double the wait; it still gets a short floor to answer in.
function fallbackTimeout(options: Options, started: number) {
  const budget = options.timeoutMs ?? 30_000;
  return Math.min(
    budget,
    Math.max(FALLBACK_FLOOR_MS, budget - (Date.now() - started)),
  );
}

const FALLBACK_FLOOR_MS = 10_000;

function text(message: WireMessage) {
  const content = message.content?.trim();
  if (!content) throw new AiUnavailable("empty reply");
  return { value: content };
}

export function complete(messages: ChatMessage[], options: Options) {
  return run(messages, options, {}, text);
}

function jsonSchemaOf(shape: z.ZodType) {
  // "input" describes what the model must write, so defaulted fields stay optional.
  const schema: Record<string, unknown> = z.toJSONSchema(shape, {
    io: "input",
  });
  delete schema.$schema;
  return schema;
}

/**
 * Asks for JSON and validates it. The provider is first asked to enforce the
 * schema; if it rejects that (HTTP 400) we fall back to plain JSON mode. One
 * retry with the validation error fed back, because open models occasionally
 * wrap JSON in prose or miss a field.
 */
export async function completeJson<T>(
  messages: ChatMessage[],
  shape: z.ZodType<T>,
  options: Options,
): Promise<T> {
  const strict = {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: options.schemaName ?? options.purpose,
        schema: jsonSchemaOf(shape),
        strict: true,
      },
    },
  };
  const loose = { response_format: { type: "json_object" } };
  let extra: Record<string, unknown> = strict;
  let attemptMessages = messages;
  for (let i = 0; i < 2; i++) {
    let raw: string;
    try {
      raw = await run(attemptMessages, options, extra, text);
    } catch (error) {
      if (extra !== strict || !(error instanceof ProviderError)) throw error;
      if (error.status !== 400) throw error;
      extra = loose;
      raw = await run(attemptMessages, options, extra, text);
    }
    const parsed = shape.safeParse(parseLooseJson(raw));
    if (parsed.success) return parsed.data;
    attemptMessages = [
      ...messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That did not match the required JSON shape: ${z.prettifyError(parsed.error)}. Reply with corrected JSON only.`,
      },
    ];
  }
  throw new AiUnavailable("invalid structured reply");
}

function parseLooseJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * One turn with tools the model may call. Arguments are validated against
 * each tool's schema; an unknown tool or invalid arguments are dropped (and
 * counted in the usage log), never thrown to the person.
 */
export async function completeWithTools(
  messages: ChatMessage[],
  tools: Tool[],
  options: Options,
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const extra = tools.length
    ? {
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: jsonSchemaOf(t.parameters),
          },
        })),
        tool_choice: "auto",
      }
    : {};
  return run(messages, options, extra, (message) => {
    const toolCalls: ToolCall[] = [];
    let dropped = 0;
    for (const [i, call] of (message.tool_calls ?? []).entries()) {
      const tool = byName.get(call.function?.name ?? "");
      const checked = tool?.parameters.safeParse(
        parseArguments(call.function?.arguments),
      );
      if (!tool || !checked?.success) {
        dropped++;
        continue;
      }
      const kept: ToolCall = {
        id: call.id || `call_${i}`,
        name: tool.name,
        args: checked.data,
      };
      if (options.accept && !options.accept(kept)) {
        dropped++;
        continue;
      }
      toolCalls.push(kept);
    }
    return {
      value: { content: message.content?.trim() || null, toolCalls },
      dropped,
    };
  });
}

/**
 * Streams reply text as it is generated (server-sent events from Nebius).
 * The fallback model is tried only if the primary fails before its first token.
 */
export async function* streamText(
  messages: ChatMessage[],
  options: Options,
): AsyncGenerator<string> {
  await guard(options);
  const e = env();
  const primary = options.model ?? e.KOE_CHAT_MODEL;
  const models =
    e.KOE_FALLBACK_MODEL === primary
      ? [primary]
      : [primary, e.KOE_FALLBACK_MODEL];
  const begun = Date.now();
  for (const [i, model] of models.entries()) {
    const started = Date.now();
    const attemptOptions =
      i === 0
        ? options
        : { ...options, timeoutMs: fallbackTimeout(options, begun) };
    let spoke = false;
    let usage: Usage | undefined;
    let logged = false;
    const log = async (ok: boolean) => {
      if (logged) return;
      logged = true;
      await recordRun({
        ...usageOf(usage),
        userId: options.userId,
        purpose: options.purpose,
        model,
        latencyMs: Date.now() - started,
        ok,
        fellBack: i > 0,
      });
    };
    try {
      const res = await post(model, messages, attemptOptions, {}, true);
      if (!res.body) throw new ProviderError("no response body", null, true);
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.trim();
          if (!data.startsWith("data:")) continue;
          const payload = data.slice(5).trim();
          if (payload === "[DONE]") return;
          let frame: {
            choices?: { delta?: { content?: string } }[];
            usage?: Usage;
          };
          try {
            frame = JSON.parse(payload);
          } catch {
            // Ignore keep-alive or partial frames.
            continue;
          }
          if (frame.usage) usage = frame.usage;
          const delta = frame.choices?.[0]?.delta?.content;
          if (delta) {
            spoke = true;
            yield delta;
          }
        }
      }
      return;
    } catch (error) {
      await log(false);
      const failure = normalise(error);
      if (
        spoke ||
        !(failure instanceof ProviderError && failure.retryable) ||
        i === models.length - 1
      )
        throw failure;
    } finally {
      // A normal end, [DONE] or a reader that stopped early all count as ok.
      await log(true);
    }
  }
}
