import "server-only";
import { z } from "zod";
import { env } from "../env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AiUnavailable extends Error {
  constructor(reason: string) {
    super(`AI unavailable: ${reason}`);
  }
}

type Options = {
  model?: string;
  temperature?: number;
  // Reasoning models spend part of this budget thinking before they answer.
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
};

function request(messages: ChatMessage[], options: Options, stream: boolean) {
  const e = env();
  if (e.KOE_AI === "off") throw new AiUnavailable("switched off by operator");
  return fetch(new URL("chat/completions", e.NEBIUS_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.NEBIUS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? e.KOE_CHAT_MODEL,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 1500,
      stream,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  }).catch((error: unknown) => {
    throw new AiUnavailable(error instanceof Error ? error.message : "network");
  });
}

export async function complete(messages: ChatMessage[], options: Options = {}) {
  const res = await request(messages, options, false);
  if (!res.ok) throw new AiUnavailable(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AiUnavailable("empty reply");
  return content;
}

/**
 * Asks for JSON and validates it. One retry with the validation error fed
 * back, because open models occasionally wrap JSON in prose or miss a field.
 */
export async function completeJson<T>(
  messages: ChatMessage[],
  shape: z.ZodType<T>,
  options: Options = {},
): Promise<T> {
  let attempt = messages;
  for (let i = 0; i < 2; i++) {
    const raw = await complete(attempt, { ...options, json: true });
    const parsed = shape.safeParse(parseLooseJson(raw));
    if (parsed.success) return parsed.data;
    attempt = [
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

/** Streams reply text as it is generated (server-sent events from Nebius). */
export async function* streamText(
  messages: ChatMessage[],
  options: Options = {},
): AsyncGenerator<string> {
  const res = await request(messages, options, true);
  if (!res.ok || !res.body) throw new AiUnavailable(`HTTP ${res.status}`);
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
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // Ignore keep-alive or partial frames.
      }
    }
  }
}
