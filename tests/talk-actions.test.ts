// @vitest-environment node
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { intakeModel } from "@/domain/intake";
import { fallbackPlan } from "@/domain/plan-menu";
import type { ToolProposal } from "@/domain/talk-tools";

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => viewer.current,
}));
const searches = vi.hoisted(() => ({
  run: vi.fn(async () => ({ ok: true, count: 3 })),
}));
vi.mock("@/server/search/shelf", () => ({ refreshShelfFor: searches.run }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": "en-GB" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("REDIRECT " + to);
  },
}));

type Reply = {
  content: string | null;
  toolCalls: { id: string; name: string; args: unknown }[];
};
const fake = vi.hoisted(() => ({
  reply: (async () => ({
    content: "Okay.",
    toolCalls: [],
  })) as () => Promise<Reply>,
  risk: "none" as string,
  calls: 0,
  options: [] as Record<string, unknown>[],
  sent: [] as unknown[],
  summary: (async () => ({
    takeaways: ["You chose to send the email first."],
  })) as () => Promise<unknown>,
  summaryCalls: 0,
}));
vi.mock("@/server/llm/nebius", () => ({
  completeWithTools: (
    messages: unknown,
    _tools: unknown,
    options: Record<string, unknown>,
  ) => {
    fake.calls++;
    fake.sent.push(messages);
    fake.options.push(options);
    return fake.reply();
  },
  completeJson: async (
    _messages: unknown,
    _shape: unknown,
    options: { purpose: string },
  ) => {
    if (options.purpose === "talk_safety") return { level: fake.risk };
    if (options.purpose === "talk_summary") {
      fake.summaryCalls++;
      return fake.summary();
    }
    throw new Error("no structured reply in this suite");
  },
  complete: async () => {
    throw new Error("no text reply in this suite");
  },
  streamText: async function* () {},
  AiUnavailable: class AiUnavailable extends Error {},
}));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.KOE_AI = "on";
  process.env.KOE_PUSH_STUB = "on";
});
beforeEach(() => {
  fake.reply = async () => ({ content: "Okay.", toolCalls: [] });
  fake.risk = "none";
  fake.calls = 0;
  fake.options = [];
  fake.sent = [];
  fake.summary = async () => ({
    takeaways: ["You chose to send the email first."],
  });
  fake.summaryCalls = 0;
  searches.run.mockClear();
  searches.run.mockResolvedValue({ ok: true, count: 3 });
});
afterEach(() => {
  vi.useRealTimers();
});

const TODAY = "2026-10-27";
const model = intakeModel.parse({
  goals: ["work_study", "energy"],
  wake: "7to9",
  days: "working",
  lifts: ["music"],
  people: ["friend"],
  names: [{ name: "Sam", save: true }],
});

async function setup(opts: { memoryOn?: boolean } = {}) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  for (const id of ["a", "b"]) {
    await db
      .insert(schema.user)
      .values({ id, name: id, email: `${id}@x.test` });
    await db.insert(schema.profile).values({
      userId: id,
      timezone: "UTC",
      memoryOn: opts.memoryOn ?? true,
      onboardedAt: new Date(),
    });
  }
  const { commitIntro, getPlanDay } = await import("@/server/data/intake");
  await commitIntro(db, "a", {
    model,
    summary: "You want more energy.",
    memories: [],
    people: ["Sam"],
    items: fallbackPlan(model),
    memoryOn: opts.memoryOn ?? true,
    today: TODAY,
  });
  const as = async (userId: string) => {
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, userId));
    viewer.current = {
      user: { id: userId },
      profile,
      db,
      today: TODAY,
      isGuest: true,
    };
  };
  await as("a");
  return {
    db,
    schema,
    as,
    plan: async () => (await getPlanDay(db, "a", TODAY))!,
  };
}

const say = async (text: string, conversationId?: string | null) => {
  const { sendMessage } = await import("@/server/actions/talk");
  const r = await sendMessage({
    conversationId: conversationId ?? undefined,
    text,
  });
  if (!r.ok) throw new Error(r.error);
  return r;
};

/** The cards on the newest assistant message of a conversation. */
async function cards(
  s: Awaited<ReturnType<typeof setup>>,
  conversationId: string,
) {
  const { getConversation } = await import("@/server/data/talk");
  const c = await getConversation(s.db, "a", conversationId);
  const last = [...c!.messages].reverse().find((m) => m.role === "assistant");
  return { messageId: last?.id ?? "", tools: last?.proposals?.tools ?? [] };
}

const planVersions = async (s: Awaited<ReturnType<typeof setup>>) =>
  (
    await s.db
      .select()
      .from(s.schema.planDay)
      .where(eq(s.schema.planDay.userId, "a"))
  ).length;

describe("Talk with tools", { timeout: 40_000 }, () => {
  it("stores a tool call as a pending card and writes nothing yet", async () => {
    const s = await setup();
    const walk = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "I can move it. Want me to?",
      toolCalls: [
        {
          id: "c1",
          name: "move_item",
          args: { itemId: walk.stepId, minuteOfDay: 1020 },
        },
      ],
    });
    const before = await planVersions(s);
    const r = await say("move my first one to 5pm");
    const { tools } = await cards(s, r.conversationId!);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "move_item",
      status: "pending",
      args: { itemId: walk.stepId, minuteOfDay: 1020 },
      meta: { title: walk.title },
    });
    expect(await planVersions(s)).toBe(before);
    expect((await s.plan()).items[0].minuteOfDay).toBe(walk.minuteOfDay);
  });

  it("confirm runs the plan move once, even if confirmed twice", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want me to move it?",
      toolCalls: [
        {
          id: "c1",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1020 },
        },
      ],
    });
    const r = await say("move it to 5pm");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { confirmProposal } = await import("@/server/actions/talk");
    const before = await planVersions(s);
    const [one, two] = await Promise.all([
      confirmProposal(messageId, tools[0].id),
      confirmProposal(messageId, tools[0].id),
    ]);
    expect(one).toEqual({
      ok: true,
      result: "Moved to 17:00. You can undo it on Today.",
    });
    expect(two).toEqual(one);
    const again = await confirmProposal(messageId, tools[0].id);
    expect(again).toEqual(one);
    expect(await planVersions(s)).toBe(before + 1);
    const moved = (await s.plan()).items.find((i) => i.stepId === item.stepId);
    expect(moved?.minuteOfDay).toBe(1020);
    expect((await s.plan()).reason).toBe("not_today_move");
    // The card remembers it is done, for when the conversation is opened again.
    const after = await cards(s, r.conversationId!);
    expect(after.tools[0]).toMatchObject({
      status: "done",
      result: one.ok ? one.result : "",
    });
    // And Today's undo takes the move back.
    const { undoPlanChange } = await import("@/server/actions/plan");
    await undoPlanChange();
    expect(
      (await s.plan()).items.find((i) => i.stepId === item.stepId)?.minuteOfDay,
    ).toBe(item.minuteOfDay);
  });

  it("a card can't be confirmed while coaching is paused", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want me to move it?",
      toolCalls: [
        {
          id: "c1",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1020 },
        },
      ],
    });
    const r = await say("move it to 5pm");
    const { messageId, tools } = await cards(s, r.conversationId!);
    await s.db.update(s.schema.profile).set({ coachingPausedAt: new Date() });
    await s.as("a");
    const { confirmProposal } = await import("@/server/actions/talk");
    const before = await planVersions(s);
    const res = await confirmProposal(messageId, tools[0].id);
    expect(res.ok).toBe(false);
    expect(await planVersions(s)).toBe(before);
    expect((await cards(s, r.conversationId!)).tools[0].status).toBe("pending");
    await s.db.update(s.schema.profile).set({ coachingPausedAt: null });
    await s.as("a");
  });

  it("dismiss writes nothing but the answer", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want me to add a reminder?",
      toolCalls: [
        { id: "c1", name: "set_reminder", args: { itemId: item.stepId } },
      ],
    });
    const r = await say("remind me about it");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { dismissProposal, confirmProposal } =
      await import("@/server/actions/talk");
    const before = await planVersions(s);
    expect(await dismissProposal(messageId, tools[0].id)).toEqual({ ok: true });
    expect(await dismissProposal(messageId, tools[0].id)).toEqual({ ok: true });
    expect(await planVersions(s)).toBe(before);
    expect(await s.db.select().from(s.schema.reminder)).toEqual([]);
    expect((await cards(s, r.conversationId!)).tools[0].status).toBe(
      "dismissed",
    );
    // A dismissed card can't be confirmed afterwards.
    const late = await confirmProposal(messageId, tools[0].id);
    expect(late.ok).toBe(false);
    expect(await s.db.select().from(s.schema.reminder)).toEqual([]);
  });

  it("confirming a reminder card sets the reminder through the existing action", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want a reminder?",
      toolCalls: [
        { id: "c1", name: "set_reminder", args: { itemId: item.stepId } },
      ],
    });
    const r = await say("remind me about it");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { confirmProposal } = await import("@/server/actions/talk");
    // Early in the day, so the item's time has not passed.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T01:00:00Z"));
    const done = await confirmProposal(messageId, tools[0].id);
    vi.useRealTimers();
    expect(done.ok).toBe(true);
    expect(done.ok && done.result).toMatch(/^Reminder set for \d\d:\d\d\.$/);
    const rows = await s.db.select().from(s.schema.reminder);
    expect(rows).toHaveLength(1);
    expect(rows[0].stepId).toBe(item.stepId);
  });

  it("a card that can't be carried out goes back to waiting", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want a reminder?",
      toolCalls: [
        { id: "c1", name: "set_reminder", args: { itemId: item.stepId } },
      ],
    });
    const r = await say("remind me about it");
    const { messageId, tools } = await cards(s, r.conversationId!);
    // Late in the day: the item's time has already passed.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    const { confirmProposal } = await import("@/server/actions/talk");
    const failed = await confirmProposal(messageId, tools[0].id);
    vi.useRealTimers();
    expect(failed.ok).toBe(false);
    expect((await cards(s, r.conversationId!)).tools[0].status).toBe("pending");
    expect(await s.db.select().from(s.schema.reminder)).toEqual([]);
  });

  it("add_item adds to today with undo, and shrink_item uses the planner's shrink", async () => {
    const s = await setup();
    fake.reply = async () => ({
      content: "Want me to add that?",
      toolCalls: [
        {
          id: "c1",
          name: "add_item",
          args: { kind: "outside", title: "Open a window", size: "tiny" },
        },
      ],
    });
    const r = await say("add something outside");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { confirmProposal } = await import("@/server/actions/talk");
    const done = await confirmProposal(messageId, tools[0].id);
    expect(done).toEqual({
      ok: true,
      result: "Added to today. You can undo it on Today.",
    });
    const plan = await s.plan();
    const added = plan.items.find((i) => i.title === "Open a window");
    expect(added).toBeTruthy();
    expect(plan.reason).toBe("add");
    const [step] = await s.db
      .select()
      .from(s.schema.step)
      .where(eq(s.schema.step.id, added!.stepId!));
    expect(step.origin).toBe("talk");

    // Shrink the biggest item that has a smaller version.
    const { smallerVersion } = await import("@/domain/day-plan");
    const big = plan.items.find((i) => smallerVersion(i, model));
    expect(big).toBeTruthy();
    fake.reply = async () => ({
      content: "Want me to make it smaller?",
      toolCalls: [
        { id: "c2", name: "shrink_item", args: { itemId: big!.stepId } },
      ],
    });
    const r2 = await say("that one is too much", r.conversationId);
    const second = await cards(s, r2.conversationId!);
    const shrunk = await confirmProposal(second.messageId, second.tools[0].id);
    expect(shrunk).toEqual({
      ok: true,
      result: "Made it smaller. You can undo it on Today.",
    });
    const after = await s.plan();
    expect(after.reason).toBe("not_today_shrink");
    expect(after.items.find((i) => i.stepId === big!.stepId)).toBeUndefined();
  });

  it("save_memory makes a memory card from Talk, with the person's edit", async () => {
    const s = await setup();
    fake.reply = async () => ({
      content: "Shall I remember that?",
      toolCalls: [
        {
          id: "c1",
          name: "save_memory",
          args: { kind: "helps", text: "Music helps in the evening" },
        },
      ],
    });
    const r = await say("music helps me wind down in the evening");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { confirmProposal } = await import("@/server/actions/talk");
    const done = await confirmProposal(messageId, tools[0].id, {
      text: "Quiet music helps in the evening",
    });
    expect(done).toEqual({ ok: true, result: "Saved to what Koe knows." });
    const { listMemory } = await import("@/server/data/memory");
    const cardsNow = await listMemory(s.db, "a");
    expect(cardsNow.map((c) => [c.source, c.text])).toContainEqual([
      "talk",
      "Quiet music helps in the evening",
    ]);
  });

  it("find_resources runs the shared pipeline once and handles the request", async () => {
    const s = await setup();
    fake.reply = async () => ({
      content: "Want me to look for that?",
      toolCalls: [
        { id: "c1", name: "find_resources", args: { goal: "sleep" } },
      ],
    });
    const r = await say("find me something to read about sleep");
    const { messageId, tools } = await cards(s, r.conversationId!);
    expect(tools[0].query).toBe(
      "tips for sleeping better when feeling low practical self-help guide for adults",
    );
    const { confirmProposal } = await import("@/server/actions/talk");
    const done = await confirmProposal(messageId, tools[0].id);
    expect(done).toEqual({
      ok: true,
      result: "Added 3 picks to your Shelf.",
    });
    const { requestedSearches } = await import("@/server/data/talk");
    expect(await requestedSearches(s.db, "a")).toEqual([]);
    expect(await confirmProposal(messageId, tools[0].id)).toEqual(done);
    expect(searches.run).toHaveBeenCalledTimes(1);
  });

  it("returns failed searches to waiting and retries the same request key", async () => {
    const s = await setup();
    fake.reply = async () => ({
      content: "Want to look for a read?",
      toolCalls: [
        { id: "s1", name: "find_resources", args: { goal: "sleep" } },
      ],
    });
    const r = await say("find a read about sleep");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { confirmProposal } = await import("@/server/actions/talk");
    searches.run.mockResolvedValueOnce({ ok: false, count: 0 });
    expect((await confirmProposal(messageId, tools[0].id)).ok).toBe(false);
    expect((await cards(s, r.conversationId!)).tools[0].status).toBe("pending");
    expect((await confirmProposal(messageId, tools[0].id)).ok).toBe(true);
    expect(searches.run.mock.calls[0]).toEqual(searches.run.mock.calls[1]);
  });

  it("recovers a search interrupted before the result was written", async () => {
    const s = await setup();
    fake.reply = async () => ({
      content: "Want to look for a read?",
      toolCalls: [
        { id: "s1", name: "find_resources", args: { goal: "sleep" } },
      ],
    });
    const r = await say("find a read about sleep");
    const { messageId, tools } = await cards(s, r.conversationId!);
    const { updateTool } = await import("@/server/data/talk");
    await updateTool(s.db, "a", messageId, tools[0].id, "pending", {
      status: "done",
      result: "Working on it.",
      startedAt: new Date(Date.now() - 180000).toISOString(),
    });
    const { confirmProposal } = await import("@/server/actions/talk");
    expect(await confirmProposal(messageId, tools[0].id)).toEqual({
      ok: true,
      result: "Added 3 picks to your Shelf.",
    });
    expect(searches.run).toHaveBeenCalledTimes(1);
  });

  it("drops invalid and guardrail-breaking calls without a word, and counts only the rest", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Here are some thoughts.",
      toolCalls: [
        {
          id: "1",
          name: "move_item",
          args: { itemId: "nope", minuteOfDay: 1020 },
        },
        {
          id: "2",
          name: "add_item",
          args: { kind: "basics", title: "Go on a diet", size: "tiny" },
        },
        {
          id: "3",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1000 },
        },
      ],
    });
    const r = await say("help me with my day");
    const { tools } = await cards(s, r.conversationId!);
    expect(tools.map((t) => t.name)).toEqual(["move_item"]);
    // A neutral lead-in when the model gives only a tool call.
    fake.reply = async () => ({
      content: null,
      toolCalls: [
        {
          id: "3",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1000 },
        },
      ],
    });
    const r2 = await say("move it later", r.conversationId);
    const { getConversation } = await import("@/server/data/talk");
    const last = (await getConversation(
      s.db,
      "a",
      r2.conversationId!,
    ))!.messages.at(-1)!;
    expect(last.content).toBe("You could try this.");
  });

  it("replaces words that say it is already done", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "I've moved it to 5pm for you.",
      toolCalls: [
        {
          id: "1",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1020 },
        },
      ],
    });
    const r = await say("move it to 5pm");
    const { getConversation } = await import("@/server/data/talk");
    const last = (await getConversation(
      s.db,
      "a",
      r.conversationId!,
    ))!.messages.at(-1)!;
    expect(last.content).not.toMatch(/moved/);
  });

  it("offers no cards on a risky turn", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    const move = {
      id: "1",
      name: "move_item",
      args: { itemId: item.stepId, minuteOfDay: 1020 },
    };

    // 1. The rules flag what the person wrote: the model is never asked.
    const a = await say("I want to disappear. Move my walk to 5pm.");
    expect(a.safety).not.toBe("none");
    expect(fake.calls).toBe(0);
    expect((await cards(s, a.conversationId!)).tools).toEqual([]);

    // 2. The classifier flags it: the reply is thrown away with its cards.
    await s.db.update(s.schema.profile).set({ coachingPausedAt: null });
    await s.as("a");
    fake.reply = async () => ({ content: "Sure.", toolCalls: [move] });
    fake.risk = "concern";
    const b = await say("everything is just grey lately");
    expect(b.safety).toBe("concern");
    expect((await cards(s, b.conversationId!)).tools).toEqual([]);

    // 3. The reply itself touches on risk: it is kept, with no cards.
    await s.db.update(s.schema.profile).set({ coachingPausedAt: null });
    await s.as("a");
    fake.risk = "none";
    fake.reply = async () => ({
      content: "You said you want to disappear. Move it to 5pm?",
      toolCalls: [move],
    });
    const c = await say("tell me what you think");
    expect(c.safety).toBe("concern");
    expect((await cards(s, c.conversationId!)).tools).toEqual([]);
  });

  it("someone else can't confirm or dismiss a card", async () => {
    const s = await setup();
    const item = (await s.plan()).items[0];
    fake.reply = async () => ({
      content: "Want me to move it?",
      toolCalls: [
        {
          id: "1",
          name: "move_item",
          args: { itemId: item.stepId, minuteOfDay: 1020 },
        },
      ],
    });
    const r = await say("move it to 5pm");
    const { messageId, tools } = await cards(s, r.conversationId!);
    await s.as("b");
    const { confirmProposal, dismissProposal } =
      await import("@/server/actions/talk");
    expect((await confirmProposal(messageId, tools[0].id)).ok).toBe(false);
    expect((await dismissProposal(messageId, tools[0].id)).ok).toBe(false);
    await s.as("a");
    expect((await cards(s, r.conversationId!)).tools[0].status).toBe("pending");
  });

  it("still reads and runs a card stored in the older shape", async () => {
    const s = await setup();
    const { startConversation, getConversation } =
      await import("@/server/data/talk");
    const { seal } = await import("@/server/crypto");
    const convo = await startConversation(s.db, "a", "talk", "Old chat");
    const [row] = await s.db
      .insert(s.schema.message)
      .values({
        userId: "a",
        conversationId: convo,
        role: "assistant",
        contentEnc: seal("Maybe a short walk?"),
        proposalsEnc: seal(
          JSON.stringify({
            step: {
              title: "Open the post on the mat",
              area: "do",
              cue: "After lunch",
            },
            memory: { kind: "helps", text: "Short walks help you" },
          }),
        ),
      })
      .returning({ id: s.schema.message.id });
    const read = await getConversation(s.db, "a", convo);
    const tools = read!.messages[0].proposals!.tools;
    expect(tools.map((t: ToolProposal) => [t.id, t.name, t.status])).toEqual([
      ["legacy-step", "add_item", "pending"],
      ["legacy-memory", "save_memory", "pending"],
    ]);
    const { confirmProposal, dismissProposal } =
      await import("@/server/actions/talk");
    // The older step card is an add_item now; dismissing the memory card works too.
    const added = await confirmProposal(row.id, "legacy-step");
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true });
    expect(
      (await s.plan()).items.some(
        (i) => i.title === "Open the post on the mat",
      ),
    ).toBe(true);
    expect(await dismissProposal(row.id, "legacy-memory")).toEqual({
      ok: true,
    });
    const after = (await getConversation(s.db, "a", convo))!.messages[0]
      .proposals!.tools;
    expect(after.map((t) => t.status)).toEqual(["done", "dismissed"]);
  });

  it("with memory off, the model gets ids, kinds, sizes and times only, and no memory or people tools", async () => {
    const s = await setup({ memoryOn: false });
    const { buildTalkContext } = await import("@/server/llm/talk-context");
    const { toolsFor } = await import("@/server/llm/talk");
    const { requireViewer } = await import("@/server/viewer");
    const ctx = await buildTalkContext(await requireViewer(), 1);
    const sent = JSON.stringify(ctx.packet);
    const plan = await s.plan();
    for (const i of plan.items) {
      expect(sent).toContain(i.stepId!);
      expect(sent).not.toContain(i.title);
      expect(sent).not.toContain(i.why);
    }
    expect(sent).not.toContain("Sam");
    // The checks still know the titles, so a card can name what it is about.
    expect(ctx.vet.items.map((i) => i.title)).toEqual(
      plan.items.map((i) => i.title),
    );
    const names = toolsFor(ctx).map((t) => t.name);
    expect(names).not.toContain("save_memory");
    expect(names).not.toContain("draft_message");
    expect(names).toContain("move_item");
    // And a request sends the same stripped picture to the model.
    fake.reply = async () => ({ content: "Okay.", toolCalls: [] });
    await say("hello");
    expect(fake.calls).toBe(1);
  });

  it("with memory on, the packet carries ids, times, people and the stable parts first", async () => {
    const s = await setup();
    const { buildTalkContext } = await import("@/server/llm/talk-context");
    const { requireViewer } = await import("@/server/viewer");
    const ctx = await buildTalkContext(await requireViewer(), 1);
    const plan = await s.plan();
    const items = ctx.packet.today!.items as { id: string; time: string }[];
    expect(items.map((i) => i.id)).toEqual(plan.items.map((i) => i.stepId));
    expect(items[0].time).toMatch(/^\d\d:\d\d$/);
    expect(ctx.packet.people).toEqual([
      { id: ctx.vet.people[0].id, name: "Sam" },
    ]);
    expect(Object.keys(ctx.packet).slice(0, 4)).toEqual([
      "v",
      "tone",
      "memory",
      "intake",
    ]);
  });

  it("an unavailable model leaves the message saved and no cards", async () => {
    const s = await setup();
    fake.reply = async () => ({ content: null, toolCalls: [] });
    const r = await say("hello there");
    expect(r.unavailable).toBe(true);
    expect((await cards(s, r.conversationId!)).tools).toEqual([]);
    const rows = await s.db
      .select()
      .from(s.schema.message)
      .where(
        and(
          eq(s.schema.message.userId, "a"),
          eq(s.schema.message.role, "assistant"),
        ),
      );
    expect(rows).toEqual([]);
  });

  it("the side panel loads only the viewer's own conversations", async () => {
    const s = await setup();
    const { loadConversation, listTalkHistory } =
      await import("@/server/actions/talk");
    const r = await say("hello there");
    const own = await loadConversation(r.conversationId);
    expect(own.ok && own.messages.length).toBe(2);
    expect((await loadConversation(null)).ok).toBe(true);
    expect((await listTalkHistory()).map((t) => t.id)).toEqual([
      r.conversationId,
    ]);
    await s.as("b");
    expect(await loadConversation(r.conversationId)).toEqual({ ok: false });
    expect(await listTalkHistory()).toEqual([]);
  });
});

/** A This week thing for `userId`, in a new week. */
async function thing(
  s: Awaited<ReturnType<typeof setup>>,
  userId: string,
  title: string,
) {
  const { saveWeek } = await import("@/server/data/week");
  const w = await saveWeek(s.db, userId, {
    draft: {
      items: [
        {
          captured: {
            what: `Private words about ${title}`,
            when: "by Friday",
            title,
          },
        },
      ],
    },
    today: TODAY,
    eatingConcern: false,
  });
  return w.items[0].id;
}

const GONE = { ok: false, error: "This conversation is gone." };

describe("Stuck? Ask Koe and This week", { timeout: 40_000 }, () => {
  it("a thing context loads only the person's own thing and keeps the focus", async () => {
    const s = await setup();
    const mine = await thing(s, "a", "Email the landlord");
    const theirs = await thing(s, "b", "Their secret thing");
    const { loadConversation, sendMessage } =
      await import("@/server/actions/talk");

    expect(await loadConversation(null, { kind: "thing", id: theirs })).toEqual(
      GONE,
    );
    expect(await loadConversation(null, { kind: "thing", id: "nope" })).toEqual(
      GONE,
    );
    expect(
      await sendMessage({ text: "hi", context: { kind: "thing", id: theirs } }),
    ).toEqual(GONE);
    expect(fake.calls).toBe(0);
    expect(await s.db.select().from(s.schema.conversation)).toEqual([]);

    const open = await loadConversation(null, { kind: "thing", id: mine });
    expect(open.ok && open.focus).toEqual({ title: "Email the landlord" });
    const r = await sendMessage({
      text: "I keep putting it off",
      context: { kind: "thing", id: mine },
    });
    if (!r.ok) throw new Error(r.error);
    // A later turn sends no context; the conversation remembers it.
    await say("it feels awkward", r.conversationId);
    const second = JSON.stringify(fake.sent[1]);
    expect(second).toContain(
      '\\"focus\\":{\\"title\\":\\"Email the landlord\\"',
    );
    expect(second).toContain("Private words about Email the landlord");
    expect(second).not.toContain("Their secret thing");
    const again = await loadConversation(r.conversationId);
    expect(again.ok && again.focus).toEqual({ title: "Email the landlord" });
  });

  it("the thisWeek block lists titles, when and state, or only a count with memory off", async () => {
    const steps = await import("@/server/data/steps");
    const { buildTalkContext } = await import("@/server/llm/talk-context");
    const { requireViewer } = await import("@/server/viewer");
    for (const memoryOn of [true, false]) {
      const s = await setup({ memoryOn });
      const id = await thing(s, "a", "Email the landlord");
      const step = await steps.createStep(
        s.db,
        "a",
        {
          area: "do",
          title: "Email the landlord",
          when: "today",
          weekItemId: id,
        },
        TODAY,
      );
      await steps.reportStep(s.db, "a", step, "partly", TODAY);
      const ctx = await buildTalkContext(await requireViewer(), 1);
      expect(ctx.packet.thisWeek).toEqual(
        memoryOn
          ? [
              {
                title: "Email the landlord",
                when: "by Friday",
                state: "moved forward 1 time",
              },
            ]
          : { openThings: 1 },
      );
      const { weekThing } = await import("@/server/data/week");
      const focused = await buildTalkContext(
        await requireViewer(),
        1,
        await weekThing(s.db, "a", id),
      );
      expect(focused.packet.focus).toEqual(
        memoryOn
          ? {
              title: "Email the landlord",
              what: "Private words about Email the landlord",
              when: "by Friday",
              state: "moved forward 1 time",
            }
          : { state: "moved forward 1 time" },
      );
      if (!memoryOn)
        expect(JSON.stringify(focused.packet)).not.toContain("landlord");
    }
  });
});

describe("Talk replies without AI tells", { timeout: 40_000 }, () => {
  it("retries once on an em dash, then rewrites the dash if it is still there", async () => {
    const s = await setup();
    const { getConversation } = await import("@/server/data/talk");
    const replies = [
      "That's clear \u2014 just the facts.",
      "Just the facts and a direct question.",
    ];
    fake.reply = async () => ({ content: replies.shift()!, toolCalls: [] });
    const r = await say("I will just say the tap leaks");
    expect(fake.calls).toBe(2);
    const last = async (id: string) =>
      (await getConversation(s.db, "a", id))!.messages.at(-1)!.content;
    expect(await last(r.conversationId!)).toBe(
      "Just the facts and a direct question.",
    );

    fake.calls = 0;
    fake.reply = async () => ({
      content: "Clear \u2014 and direct.",
      toolCalls: [],
    });
    const again = await say("ok", r.conversationId);
    expect(fake.calls).toBe(2);
    expect(await last(again.conversationId!)).toBe("Clear, and direct.");

    fake.calls = 0;
    fake.reply = async () => ({ content: "Okay. When?", toolCalls: [] });
    await say("fine", r.conversationId);
    expect(fake.calls).toBe(1);
  });

  it("cuts an opener tell and the repeated AI line after the retry", async () => {
    const s = await setup();
    const { getConversation } = await import("@/server/data/talk");
    fake.reply = async () => ({
      content:
        "I'm an AI, not a person or a therapist. I hear you. Heavy day. Today can be really small.",
      toolCalls: [],
    });
    const r = await say("Today is heavy. I can't face anything.");
    expect(fake.calls).toBe(2);
    const last = async (id: string) =>
      (await getConversation(s.db, "a", id))!.messages.at(-1)!.content;
    expect(await last(r.conversationId!)).toBe(
      "Heavy day. Today can be really small.",
    );

    fake.reply = async () => ({
      content: "It sounds like a lot.",
      toolCalls: [],
    });
    const again = await say("so much going on", r.conversationId);
    expect(await last(again.conversationId!)).toBe(
      "Tell me a bit more about that.",
    );

    fake.reply = async () => ({
      content: "I'm an AI, not a person or a therapist.",
      toolCalls: [],
    });
    const asked = await say("Are you a real person?", r.conversationId);
    expect(await last(asked.conversationId!)).toBe(
      "I'm an AI, not a person or a therapist.",
    );
  });
});

describe("Takeaways", { timeout: 40_000 }, () => {
  it("checks the output: risk, AI tells, stock phrases and length", async () => {
    const { checkTakeaways } = await import("@/server/llm/summaries");
    const ok = (t: string[]) => checkTakeaways({ takeaways: t }, false);
    expect(ok(["You chose to send the email first."])).toEqual([
      "You chose to send the email first.",
    ]);
    expect(ok([])).toBeNull();
    expect(ok(["You a.", "You b.", "You c.", "You d."])).toBeNull();
    expect(ok(["You said " + "x".repeat(90)])).toBeNull();
    expect(ok(["You said you want to kill yourself."])).toBeNull();
    expect(ok(["It sounds like you chose the email."])).toBeNull();
    expect(ok(["You chose the email — first."])).toBeNull();
    expect(ok(["You took baby steps."])).toBeNull();
    expect(
      checkTakeaways({ takeaways: ["You skip meals to lose weight."] }, true),
    ).toBeNull();
    // The person's own words pass, even where a plan item's rule would not.
    const said = [
      "You want the landlord email to stay factual, not rude",
      "You will say the tap has leaked for a week and ask when they can fix it.",
    ];
    expect(ok(said)).toEqual(said);
    expect(ok(["You want to ask your therapist about it."])).toBeNull();
  });

  it("Close stores takeaways once; a failed check stores nothing", async () => {
    const s = await setup();
    const { summariseConversation, loadConversation } =
      await import("@/server/actions/talk");
    const { getSummary } = await import("@/server/data/talk");
    const r = await say("I keep putting off the email");
    // One message from the person is not enough.
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    expect(fake.summaryCalls).toBe(0);
    await say("I will send it first", r.conversationId);

    fake.summary = async () => ({ takeaways: ["You " + "y".repeat(95)] });
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    expect(await getSummary(s.db, "a", r.conversationId!)).toBeNull();
    // One attempt: the same messages are not tried again.
    fake.summary = async () => ({
      takeaways: ["You chose to send the email first."],
    });
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    expect(fake.summaryCalls).toBe(1);

    await say("and then tidy the desk", r.conversationId);
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: true,
    });
    const l = await loadConversation(r.conversationId);
    expect(l.ok && l.takeaways).toEqual([
      { text: "You chose to send the email first.", kept: false },
    ]);
    // Nothing new since: no second call.
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    expect(fake.summaryCalls).toBe(2);
    // Another person can't summarise it.
    await s.as("b");
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
  });

  it("no takeaways with memory off or while safety-paused", async () => {
    const s = await setup({ memoryOn: false });
    const { summariseConversation } = await import("@/server/actions/talk");
    const r = await say("I keep putting off the email");
    await say("I will send it first", r.conversationId);
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    await s.db
      .update(s.schema.profile)
      .set({ memoryOn: true })
      .where(eq(s.schema.profile.userId, "a"));
    await s.as("a");
    const { setConversationPaused } = await import("@/server/data/talk");
    await setConversationPaused(s.db, "a", r.conversationId!, true);
    expect(await summariseConversation(r.conversationId!)).toEqual({
      ok: false,
    });
    expect(fake.summaryCalls).toBe(0);
  });

  it("History summarises idle conversations lazily and shows the first takeaway", async () => {
    const s = await setup();
    const { listTalkHistory } = await import("@/server/actions/talk");
    const r = await say("I keep putting off the email");
    await say("I will send it first", r.conversationId);
    expect((await listTalkHistory())[0].takeaway).toBeNull();
    expect(fake.summaryCalls).toBe(0);
    await s.db
      .update(s.schema.conversation)
      .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(s.schema.conversation.id, r.conversationId!));
    expect((await listTalkHistory())[0].takeaway).toBe(
      "You chose to send the email first.",
    );
    expect(fake.summaryCalls).toBe(1);
  });

  it("keepTakeaway keeps the stored text once, for the owner only", async () => {
    const s = await setup();
    const { keepTakeaway, summariseConversation } =
      await import("@/server/actions/talk");
    const { listMemory } = await import("@/server/data/memory");
    const r = await say("I keep putting off the email");
    await say("I will send it first", r.conversationId);
    await summariseConversation(r.conversationId!);
    await s.as("b");
    expect(await keepTakeaway(r.conversationId!, 0)).toEqual(GONE);
    expect(await listMemory(s.db, "b")).toEqual([]);
    await s.as("a");
    expect(await keepTakeaway(r.conversationId!, 1)).toEqual(GONE);
    expect(await keepTakeaway(r.conversationId!, 0)).toEqual({ ok: true });
    expect(await keepTakeaway(r.conversationId!, 0)).toEqual({ ok: true });
    const cards = await listMemory(s.db, "a");
    expect(cards.map((c) => [c.kind, c.text, c.source])).toEqual([
      ["preference", "You chose to send the email first.", "talk"],
    ]);
  });
});
