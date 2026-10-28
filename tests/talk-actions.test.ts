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
}));
vi.mock("@/server/llm/nebius", () => ({
  completeWithTools: (
    _messages: unknown,
    _tools: unknown,
    options: Record<string, unknown>,
  ) => {
    fake.calls++;
    fake.options.push(options);
    return fake.reply();
  },
  completeJson: async (
    _messages: unknown,
    _shape: unknown,
    options: { purpose: string },
  ) => {
    if (options.purpose === "talk_safety") return { level: fake.risk };
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
    expect(last.content).toBe("Here's something you could do.");
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
