// @vitest-environment node
import { randomBytes } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

// The provider and the search SDK are mocked: nothing here touches the network.
const holder = vi.hoisted(() => ({ db: undefined as unknown, broken: false }));
vi.mock("@/server/db", () => ({
  db: async () => {
    if (holder.broken) throw new Error("db down");
    return holder.db;
  },
}));
const search = vi.hoisted(() => vi.fn());
vi.mock("@tavily/core", () => ({ tavily: () => ({ search }) }));

const ULTRA = "nvidia/Nemotron-3-Ultra-550b-a55b";
const CHAT = ULTRA;
const SUPER = "nvidia/Nemotron-3_5-Lightning";
const NANO = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

type Db = Awaited<ReturnType<typeof import("@/server/db").openDb>>;
let db: Db;
let schema: typeof import("@/server/db/schema");
const fetchMock = vi.fn();

beforeAll(async () => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const actual =
    await vi.importActual<typeof import("@/server/db")>("@/server/db");
  schema = await import("@/server/db/schema");
  db = await actual.openDb("memory:");
  holder.db = db;
  await db.insert(schema.user).values([
    { id: "u1", name: "u1", email: "u1@example.com" },
    { id: "u2", name: "u2", email: "u2@example.com" },
  ]);
}, 30_000);

beforeEach(async () => {
  holder.broken = false;
  await db.delete(schema.agentRun);
  fetchMock.mockReset();
  search.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const k of ["KOE_AI", "KOE_SEARCH", "TAVILY_API_KEY"])
    delete process.env[k];
  process.env.KOE_AI_DAILY_CALLS = "5";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Fresh module graph, so env changes made by a test take effect. */
async function load() {
  vi.resetModules();
  return {
    nebius: await import("@/server/llm/nebius"),
    usage: await import("@/server/llm/usage"),
    tavily: await import("@/server/search/tavily"),
  };
}

const reply = (content: string | null, extra: object = {}, usage?: object) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content, ...extra } }],
      usage,
    }),
    { status: 200 },
  );
const status = (code: number) => new Response("{}", { status: code });
const timeout = () =>
  Promise.reject(new DOMException("The operation timed out", "TimeoutError"));
const bodyOf = (call: number) =>
  JSON.parse(fetchMock.mock.calls[call][1].body as string);
const runs = () => db.select().from(schema.agentRun);
const user = { role: "user", content: "hi" } as const;

describe("requests", () => {
  it("always switches reasoning off, on every kind of call", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => reply('{"a":1}'));
    await nebius.complete([user], { purpose: "coach" });
    await nebius.completeJson([user], z.object({ a: z.number() }), {
      purpose: "coach",
    });
    await nebius.completeWithTools([user], [], { purpose: "talk" });
    for (let i = 0; i < 3; i++)
      expect(bodyOf(i).chat_template_kwargs).toEqual({
        enable_thinking: false,
      });
    fetchMock.mockImplementation(
      async () => new Response("data: [DONE]\n\n", { status: 200 }),
    );
    await nebius.streamText([user], { purpose: "talk" }).next();
    expect(bodyOf(3).chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(bodyOf(3).stream_options).toEqual({ include_usage: true });
    expect(bodyOf(0).model).toBe(CHAT);
  });

  it("is switched off by the operator kill switch", async () => {
    process.env.KOE_AI = "off";
    const { nebius } = await load();
    await expect(nebius.complete([user], { purpose: "coach" })).rejects.toThrow(
      /switched off/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fallback model", () => {
  it.each([
    ["HTTP 503", () => status(503)],
    ["HTTP 429", () => status(429)],
    ["a timeout", timeout],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("retries once on the fallback after %s", async (_, first) => {
    const { nebius } = await load();
    fetchMock.mockImplementationOnce(async () => first());
    fetchMock.mockImplementationOnce(async () => reply("hello"));
    expect(await nebius.complete([user], { purpose: "talk" })).toBe("hello");
    expect(bodyOf(0).model).toBe(CHAT);
    expect(bodyOf(1).model).toBe(SUPER);
    const rows = await runs();
    expect(rows.map((r) => [r.model, r.ok, r.fellBack]).sort()).toEqual(
      [
        [CHAT, false, false],
        [SUPER, true, true],
      ].sort(),
    );
  });

  it("does not retry other client errors", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => status(401));
    await expect(nebius.complete([user], { purpose: "talk" })).rejects.toThrow(
      /HTTP 401/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the fallback also fails", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => status(500));
    await expect(nebius.complete([user], { purpose: "talk" })).rejects.toThrow(
      /AI unavailable/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back for tool calls and JSON too", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementationOnce(async () => status(503));
    fetchMock.mockImplementationOnce(async () => reply("ok"));
    await nebius.completeWithTools([user], [], { purpose: "talk" });
    fetchMock.mockImplementationOnce(async () => timeout());
    fetchMock.mockImplementationOnce(async () => reply('{"a":1}'));
    await nebius.completeJson([user], z.object({ a: z.number() }), {
      purpose: "coach",
    });
    expect(bodyOf(3).model).toBe(SUPER);
  });

  const sse = (...frames: string[]) =>
    new Response(frames.map((f) => `data: ${f}\n\n`).join(""), { status: 200 });
  const token = (t: string) =>
    JSON.stringify({ choices: [{ delta: { content: t } }] });

  it("streams from the fallback if the primary fails before a token", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementationOnce(async () => status(503));
    fetchMock.mockImplementationOnce(async () =>
      sse(
        token("Hel"),
        token("lo"),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
        "[DONE]",
      ),
    );
    let out = "";
    for await (const t of nebius.streamText([user], { purpose: "talk" }))
      out += t;
    expect(out).toBe("Hello");
    const rows = await runs();
    const ok = rows.find((r) => r.ok);
    expect(ok).toMatchObject({
      model: SUPER,
      fellBack: true,
      tokensIn: 10,
      tokensOut: 2,
    });
  });

  it("does not switch models once streaming has started", async () => {
    const { nebius } = await load();
    let pulls = 0;
    const broken = new ReadableStream<Uint8Array>({
      // The first read delivers a token; the second finds the connection dropped.
      pull(controller) {
        if (pulls++ === 0)
          controller.enqueue(
            new TextEncoder().encode(`data: ${token("Hel")}\n\n`),
          );
        else controller.error(new TypeError("terminated"));
      },
    });
    fetchMock.mockImplementation(async () => new Response(broken));
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const t of nebius.streamText([user], { purpose: "talk" }))
          got.push(t);
      })(),
    ).rejects.toThrow(/AI unavailable/);
    expect(got).toEqual(["Hel"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("structured replies", () => {
  const shape = z.object({
    a: z.number(),
    b: z.string().optional().default(""),
  });

  it("asks for a strict JSON schema first", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => reply('{"a":1}'));
    expect(
      await nebius.completeJson([user], shape, {
        purpose: "coach",
        schemaName: "thing",
      }),
    ).toEqual({ a: 1, b: "" });
    const rf = bodyOf(0).response_format;
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema).toMatchObject({ name: "thing", strict: true });
    expect(rf.json_schema.schema.properties.a).toEqual({ type: "number" });
    expect(rf.json_schema.schema.required).toEqual(["a"]);
  });

  it("downgrades to json_object when the provider rejects the schema", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementationOnce(async () => status(400));
    fetchMock.mockImplementationOnce(async () => reply('Sure! {"a":2}'));
    expect(
      await nebius.completeJson([user], shape, { purpose: "coach" }),
    ).toEqual({ a: 2, b: "" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1).response_format).toEqual({ type: "json_object" });
    // Same model both times: a 400 is not a reason to switch models.
    expect(bodyOf(1).model).toBe(CHAT);
  });

  it("feeds validation errors back once, then gives up", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementationOnce(async () => reply('{"a":"x"}'));
    fetchMock.mockImplementationOnce(async () => reply('{"a":3}'));
    expect(
      await nebius.completeJson([user], shape, { purpose: "coach" }),
    ).toEqual({ a: 3, b: "" });
    expect(bodyOf(1).messages.at(-1).content).toMatch(/did not match/);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => reply("no json at all"));
    await expect(
      nebius.completeJson([user], shape, { purpose: "coach" }),
    ).rejects.toThrow(/invalid structured reply/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("tool calls", () => {
  const tools = [
    {
      name: "add_step",
      description: "Add a step",
      parameters: z.object({ title: z.string().min(3) }),
    },
    {
      name: "no_args",
      description: "Takes nothing",
      parameters: z.object({}),
    },
  ];
  const call = (id: string, name: string, args: unknown) => ({
    id,
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    },
  });

  it("sends tools as JSON schema and keeps only valid calls", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () =>
      reply(null, {
        tool_calls: [
          call("c1", "add_step", { title: "Walk" }),
          call("c2", "add_step", { title: "x" }),
          call("c3", "delete_everything", {}),
          call("c4", "add_step", "{not json"),
          call("c5", "no_args", ""),
        ],
      }),
    );
    const out = await nebius.completeWithTools([user], tools, {
      purpose: "talk",
      userId: "u1",
    });
    expect(out.content).toBeNull();
    expect(out.toolCalls).toEqual([
      { id: "c1", name: "add_step", args: { title: "Walk" } },
      { id: "c5", name: "no_args", args: {} },
    ]);
    const body = bodyOf(0);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools[0]).toMatchObject({
      type: "function",
      function: {
        name: "add_step",
        description: "Add a step",
        parameters: { type: "object", required: ["title"] },
      },
    });
    const [row] = await runs();
    expect(row.toolCallsDropped).toBe(3);
  });

  it("drops, and counts, a valid call the caller's own check refuses", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () =>
      reply(null, {
        tool_calls: [
          call("c1", "add_step", { title: "Walk" }),
          call("c2", "add_step", { title: "Diet plan" }),
        ],
      }),
    );
    const out = await nebius.completeWithTools([user], tools, {
      purpose: "talk",
      userId: "u1",
      accept: (c) => (c.args as { title: string }).title !== "Diet plan",
    });
    expect(out.toolCalls.map((c) => c.id)).toEqual(["c1"]);
    const [row] = await runs();
    expect(row.toolCallsDropped).toBe(1);
  });

  it("returns plain text when no tool is called", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => reply(" Hello "));
    expect(
      await nebius.completeWithTools([user], tools, { purpose: "talk" }),
    ).toEqual({ content: "Hello", toolCalls: [] });
  });

  it("sends assistant tool calls and tool results back", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => reply("Done"));
    await nebius.completeWithTools(
      [
        user,
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c1", name: "add_step", args: { title: "Walk" } }],
        },
        { role: "tool", toolCallId: "c1", content: '{"ok":true}' },
      ],
      tools,
      { purpose: "talk" },
    );
    const sent = bodyOf(0).messages;
    expect(sent[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "add_step", arguments: '{"title":"Walk"}' },
        },
      ],
    });
    expect(sent[2]).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: '{"ok":true}',
    });
  });
});

describe("usage log", () => {
  it("stores counts and cost, and has no text column", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () =>
      reply(
        "a secret reply",
        {},
        {
          prompt_tokens: 1000,
          completion_tokens: 500,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      ),
    );
    await nebius.complete([{ role: "user", content: "a secret prompt" }], {
      purpose: "intake",
      userId: "u1",
    });
    const [row] = await runs();
    expect(row).toMatchObject({
      userId: "u1",
      purpose: "intake",
      model: CHAT,
      tokensIn: 1000,
      tokensOut: 500,
      ok: true,
      fellBack: false,
    });
    // 1000 in at $1/M plus 500 out at $3/M.
    expect(Number(row.estCostUsd)).toBeCloseTo(0.0025, 6);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(getTableColumns(schema.agentRun)).sort()).toEqual(
      [
        "id",
        "userId",
        "purpose",
        "model",
        "tokensIn",
        "tokensOut",
        "latencyMs",
        "estCostUsd",
        "ok",
        "fellBack",
        "toolCallsDropped",
        "createdAt",
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/secret/);
  });

  it("prices cached tokens and leaves unknown models null", async () => {
    const { usage } = await load();
    expect(usage.estimateCostUsd(ULTRA, 1000, 0, 1000)).toBeCloseTo(0.00012, 8);
    expect(usage.estimateCostUsd(NANO, 1_000_000, 1_000_000)).toBeCloseTo(
      0.3,
      8,
    );
    expect(usage.estimateCostUsd("someone/else", 10, 10)).toBeNull();
    await usage.recordRun({
      purpose: "eval",
      model: "someone/else",
      latencyMs: 5,
      ok: true,
    });
    expect((await runs())[0].estCostUsd).toBeNull();
  });

  it("records failures too, and never breaks the request when logging fails", async () => {
    const { nebius } = await load();
    fetchMock.mockImplementation(async () => status(401));
    await expect(
      nebius.complete([user], { purpose: "coach" }),
    ).rejects.toThrow();
    expect((await runs()).map((r) => r.ok)).toEqual([false]);

    holder.broken = true;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => reply("fine"));
    expect(await nebius.complete([user], { purpose: "coach" })).toBe("fine");
  });
});

describe("daily budget", () => {
  const rowFor = (userId: string, createdAt = new Date()) => ({
    userId,
    purpose: "talk",
    model: CHAT,
    ok: true,
    createdAt,
  });

  it("stops a person's calls once today's limit is used", async () => {
    const { nebius, usage } = await load();
    await db
      .insert(schema.agentRun)
      .values(Array.from({ length: 5 }, () => rowFor("u1")));
    expect(await usage.aiBudgetLeft("u1")).toBe(0);
    expect(await usage.aiBudgetLeft("u2")).toBe(5);
    fetchMock.mockImplementation(async () => reply("hi"));
    await expect(
      nebius.complete([user], { purpose: "talk", userId: "u1" }),
    ).rejects.toThrow(/daily limit/);
    expect(fetchMock).not.toHaveBeenCalled();
    // Other people, and calls with no person attached, are unaffected.
    expect(
      await nebius.complete([user], { purpose: "talk", userId: "u2" }),
    ).toBe("hi");
    expect(await nebius.complete([user], { purpose: "eval" })).toBe("hi");
  });

  it("counts only today, in UTC", async () => {
    const { usage } = await load();
    const yesterday = new Date(Date.now() - 36 * 3_600_000);
    await db
      .insert(schema.agentRun)
      .values([rowFor("u1", yesterday), rowFor("u1"), rowFor("u1")]);
    expect(await usage.aiBudgetLeft("u1")).toBe(3);
  });
});

describe("web search", () => {
  const hit = {
    title: "T",
    url: "https://example.org/a",
    content: "C",
    score: 0.9,
    publishedDate: "",
    id: "1",
  };

  it("is unavailable when switched off, without calling out", async () => {
    process.env.KOE_SEARCH = "off";
    process.env.TAVILY_API_KEY = "tvly-test";
    const { tavily } = await load();
    await expect(tavily.searchWeb({ query: "q" })).rejects.toBeInstanceOf(
      tavily.SearchUnavailable,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it("is unavailable without a key", async () => {
    process.env.TAVILY_API_KEY = "";
    const { tavily } = await load();
    await expect(tavily.searchWeb({ query: "q" })).rejects.toThrow(
      /no API key/,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it("searches with basic depth and logs a text-free row", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const { tavily } = await load();
    search.mockResolvedValue({ results: [hit] });
    const out = await tavily.searchWeb({
      query: "counsellors near me",
      includeDomains: ["example.org"],
      maxResults: 3,
      userId: "u1",
    });
    expect(out).toEqual([
      { title: "T", url: "https://example.org/a", content: "C", score: 0.9 },
    ]);
    expect(search).toHaveBeenCalledWith(
      "counsellors near me",
      expect.objectContaining({
        searchDepth: "basic",
        maxResults: 3,
        includeDomains: ["example.org"],
        timeout: 10,
      }),
    );
    const [row] = await runs();
    expect(row).toMatchObject({
      userId: "u1",
      purpose: "search",
      model: "tavily",
      tokensIn: 0,
      tokensOut: 0,
      ok: true,
    });
    expect(JSON.stringify(row)).not.toMatch(/counsellors/);
  });

  it("reports provider failures as SearchUnavailable", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const { tavily } = await load();
    search.mockRejectedValue(new Error("boom tvly-test"));
    const error = await tavily.searchWeb({ query: "q" }).catch((e) => e);
    expect(error).toBeInstanceOf(tavily.SearchUnavailable);
    expect(String(error.message)).not.toMatch(/tvly/);
    expect((await runs()).map((r) => r.ok)).toEqual([false]);
  });
});
