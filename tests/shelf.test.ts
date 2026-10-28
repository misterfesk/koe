// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Db } from "@/server/db";
import type { Viewer } from "@/server/viewer";

const fake = vi.hoisted(() => ({
  env: {
    KOE_AI: "on",
    KOE_SEARCH: "on",
    TAVILY_API_KEY: "fake-only",
    KOE_FAST_MODEL: "nano",
    DATA_ENCRYPTION_KEY: "",
    APP_URL: "http://127.0.0.1:3100",
    KOE_AI_DAILY_CALLS: 200,
  },
  hits: [] as { title: string; url: string; content: string; score: number }[],
  model: vi.fn(),
  search: vi.fn(),
  current: null as unknown,
  db: null as unknown,
}));
vi.mock("@/server/env", () => ({ env: () => fake.env }));
vi.mock("@/server/llm/nebius", () => ({
  completeJson: (...a: unknown[]) => fake.model(...a),
}));
vi.mock("@tavily/core", () => ({
  tavily: () => ({ search: (...a: unknown[]) => fake.search(...a) }),
}));
vi.mock("@/server/viewer", () => ({
  requireViewer: () => fake.current,
  getViewer: () => fake.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/llm/usage", () => ({
  aiBudgetLeft: async () => 200,
  recordRun: async (r: Record<string, unknown>) => {
    const { agentRun } = await import("@/server/db/schema");
    await (fake.db as Db).insert(agentRun).values({
      userId: r.userId as string,
      purpose: "search",
      model: "tavily",
      ok: !!r.ok,
      createdAt: new Date(),
    });
  },
}));

let db: Db;
const TODAY = "2026-10-27";
const tags = { goal: "sleep", format: "article", region: "GB" } as const;
const hits = [
  {
    title: "Sleep and your day",
    url: "https://www.nhs.uk/mental-health/sleep",
    content:
      "A practical guide for adults who want ideas about sleep and low mood. Find information about choosing a manageable time to wind down and things to consider for your day.",
    score: 1,
  },
  {
    title: "Making room for music",
    url: "https://www.mind.org.uk/music",
    content:
      "A practical guide for adults who want to make a little time for music and other interests. Explore how to choose something familiar and manageable during a difficult day.",
    score: 0.9,
  },
  {
    title: "Walking at your pace",
    url: "https://www.helpguide.org/walking",
    content:
      "Information for adults about finding an ordinary walk that fits their day. Consider a nearby route, a manageable distance, and whether being outdoors feels right for you.",
    score: 0.8,
  },
];
beforeAll(async () => {
  fake.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { openDb } = await import("@/server/db");
  db = await openDb("memory:");
  fake.db = db;
});
afterAll(async () => {
  await db.$client.close();
});
beforeEach(async () => {
  const s = await import("@/server/db/schema");
  await db.delete(s.user);
  await db.delete(s.resourceCache);
  fake.env.KOE_AI = "on";
  fake.env.KOE_SEARCH = "on";
  fake.env.TAVILY_API_KEY = "fake-only";
  delete process.env.KOE_SEARCH_STUB;
  fake.hits = structuredClone(hits);
  fake.search
    .mockReset()
    .mockImplementation(async () => ({ results: fake.hits }));
  fake.model.mockReset().mockResolvedValue({
    ok: true,
    audience: "adult",
    why: "You might find ideas for winding down here.",
  });
  for (const id of ["a", "b"]) {
    await db
      .insert(s.user)
      .values({ id, name: id, email: `${id}@test.invalid` });
    await db
      .insert(s.profile)
      .values({ userId: id, region: "GB", onboardedAt: new Date() });
  }
});
async function viewer(id = "a") {
  const s = await import("@/server/db/schema");
  const [profile] = await db
    .select()
    .from(s.profile)
    .where(eq(s.profile.userId, id));
  const v = {
    user: { id },
    profile,
    db,
    today: TODAY,
    isGuest: true,
  } as Viewer;
  fake.current = v;
  return v;
}
async function model(eatingConcern = false) {
  const s = await import("@/server/db/schema");
  const { seal } = await import("@/server/crypto");
  const { intakeModel } = await import("@/domain/intake");
  await db
    .insert(s.userModel)
    .values({
      userId: "a",
      dataEnc: seal(
        JSON.stringify(
          intakeModel.parse({
            goals: ["enjoy_again"],
            lifts: ["music", "cooking"],
            eatingConcern,
          }),
        ),
      ),
      summaryEnc: seal("Secret personal summary"),
    })
    .onConflictDoUpdate({
      target: s.userModel.userId,
      set: {
        dataEnc: seal(
          JSON.stringify(
            intakeModel.parse({
              goals: ["enjoy_again"],
              lifts: ["music", "cooking"],
              eatingConcern,
            }),
          ),
        ),
      },
    });
}

describe("Shelf pipeline", { timeout: 30000 }, () => {
  it("coalesces concurrent opens, saves encrypted why lines, reuses public cache without snippets", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const s = await import("@/server/db/schema");
    const v = await viewer();
    const results = await Promise.all([
      refreshShelfFor(v, tags, "one"),
      refreshShelfFor(v, tags, "one"),
      refreshShelfFor(await viewer("b"), tags, "two"),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fake.search).toHaveBeenCalledTimes(1);
    const a = await getShelf(v);
    expect(a.current).toHaveLength(3);
    expect(a.current[0].why).toBe(
      "You might find ideas for winding down here.",
    );
    const rows = await db.select().from(s.shelfItem);
    expect(rows[0].whyEnc).not.toContain("You might");
    const cache = JSON.stringify(await db.select().from(s.resourceCache));
    expect(cache).not.toContain("content");
    expect(cache).not.toContain("winding down");
    expect(cache).not.toContain("practical guide");
    expect((await getShelf(await viewer("b"))).current[0].why).toContain(
      "You chose sleep",
    );
    const again = await refreshShelfFor(v, tags, "three");
    expect(again.count).toBe(0);
  });
  it("records empty outcomes and never searches again on repeated weekly opens", async () => {
    fake.hits = [];
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    await refreshShelfFor(v);
    await refreshShelfFor(v);
    expect(fake.search).toHaveBeenCalledTimes(1);
    expect((await getShelf(v)).refreshNeeded).toBe(false);
  });
  it("keeps completed request keys idempotent after the week changes", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const v = await viewer();
    const first = await refreshShelfFor(v, tags, "old-confirmation");
    expect(
      await refreshShelfFor(
        { ...v, today: "2026-11-03" },
        tags,
        "old-confirmation",
      ),
    ).toEqual(first);
    expect(fake.search).toHaveBeenCalledTimes(1);
  });
  it("resumes stale Talk searches through Shelf even after this week's refresh", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const { startConversation, addMessage, requestedSearches, getMessage } =
      await import("@/server/data/talk");
    const { refreshShelf } = await import("@/server/actions/shelf");
    const v = await viewer();
    await refreshShelfFor(v);
    const convo = await startConversation(db, "a", "talk", "A read");
    const result = await refreshShelfFor(v, tags, `${convo}:interrupted`);
    const msg = await addMessage(db, "a", convo, "assistant", "A read", {
      tools: [
        {
          id: "interrupted",
          name: "find_resources",
          args: tags,
          status: "done",
          result: "Working on it.",
          startedAt: new Date(Date.now() - 180000).toISOString(),
        },
      ],
    });
    expect((await getShelf(v)).refreshNeeded).toBe(true);
    const calls = fake.search.mock.calls.length;
    await refreshShelf();
    expect(fake.search).toHaveBeenCalledTimes(calls);
    expect(await requestedSearches(db, "a")).toEqual([]);
    expect(
      (await getMessage(db, "a", msg.id))?.proposals?.tools[0].result,
    ).toBe(
      result.count
        ? `Added ${result.count} picks to your Shelf.`
        : "No new picks this time. You can check your Shelf later.",
    );
    expect((await getShelf(v)).refreshNeeded).toBe(false);
  });
  it("finishes safely if the owner deletes their account during search", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const s = await import("@/server/db/schema");
    fake.search.mockImplementation(async () => {
      await db.delete(s.user).where(eq(s.user.id, "a"));
      return { results: hits };
    });
    expect(
      (await refreshShelfFor(await viewer(), tags, "deleted-owner")).ok,
    ).toBe(false);
    expect(await db.select().from(s.shelfItem)).toHaveLength(0);
    expect(await db.select().from(s.shelfRefresh)).toHaveLength(0);
  });
  it("fails closed on model failures and young or unclear audiences", async () => {
    fake.model.mockRejectedValue(new Error("provider failure"));
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    expect((await refreshShelfFor(v, tags, "failed-model")).count).toBe(0);
    expect((await getShelf(v)).current).toEqual([]);
    fake.model.mockResolvedValue({
      ok: true,
      why: "You might find ideas here.",
      audience: "unclear",
    });
    expect(
      (await refreshShelfFor(v, { goal: "energy" }, "unclear")).count,
    ).toBe(0);
  });
  it("uses template why for rejected model copy", async () => {
    fake.model.mockResolvedValue({
      ok: true,
      audience: "adult",
      why: "You can call 0412 345 678 for my advice.",
    });
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    await refreshShelfFor(v, tags, "unsafe-why");
    expect(
      (await getShelf(v)).current.every((r) =>
        r.why.startsWith("You chose sleep."),
      ),
    ).toBe(true);
  });
  it("sends harmless publisher prose through Nano while keeping strict generated-copy checks", async () => {
    fake.hits = [
      {
        ...hits[0],
        content:
          "We explain practical ideas from clinical research for adults. You can use our guide to consider bedtime routines, avoid alcohol before bed, and choose what fits your day.",
      },
    ];
    fake.model.mockResolvedValue({
      ok: true,
      audience: "adult",
      why: "You can use our clinical guide to wind down.",
    });
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    expect((await refreshShelfFor(v, tags, "publisher-prose")).count).toBe(1);
    expect(fake.model).toHaveBeenCalledTimes(1);
    expect((await getShelf(v)).current[0].why).toBe(
      "You chose sleep. You might find ideas here.",
    );
  });
  it("keeps rules with AI off and rechecks cached eating constraints with memory off", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const s = await import("@/server/db/schema");
    await refreshShelfFor(await viewer("b"), tags, "populate");
    await model(true);
    await db
      .update(s.profile)
      .set({ memoryOn: false })
      .where(eq(s.profile.userId, "a"));
    const v = await viewer();
    await refreshShelfFor(v, tags, "eat-cache");
    const a = await getShelf(v);
    expect(a.current).toHaveLength(2);
    expect(a.current.some((r) => /walking/i.test(r.title))).toBe(false);
    expect(fake.search).toHaveBeenCalledTimes(1);
    fake.env.KOE_AI = "off";
    fake.hits = [hits[0], { ...hits[1], title: "For young people" }];
    await refreshShelfFor(v, { goal: "energy" }, "rules-only");
    expect(fake.model).toHaveBeenCalledTimes(3);
  });
  it("uses generic tags when memory is off without sending stored model words or choices", async () => {
    await model(true);
    const s = await import("@/server/db/schema");
    await db
      .update(s.profile)
      .set({ memoryOn: false })
      .where(eq(s.profile.userId, "a"));
    const { refreshShelfFor } = await import("@/server/search/shelf");
    await refreshShelfFor(await viewer());
    expect(fake.search.mock.calls[0][0]).toBe(
      "getting through the day with low mood practical self-help guide for adults article",
    );
    const sent = JSON.stringify(fake.model.mock.calls);
    expect(sent).not.toContain("Secret personal");
    expect(sent).not.toContain('"interest":"music"');
    expect(sent).not.toContain("enjoy_again");
  });
  it("revalidates cache hosts and titles instead of trusting persisted data", async () => {
    const s = await import("@/server/db/schema");
    const { refreshShelfFor } = await import("@/server/search/shelf");
    await refreshShelfFor(await viewer("b"), tags, "cache");
    const [cache] = await db.select().from(s.resourceCache);
    const rows = cache.results as object[];
    await db.update(s.resourceCache).set({
      results: [
        { ...rows[0], url: "https://nhs.uk.evil.com" },
        { ...rows[1], title: "For young people" },
      ],
    });
    expect((await refreshShelfFor(await viewer(), tags, "recheck")).count).toBe(
      0,
    );
    expect(fake.search).toHaveBeenCalledTimes(1);
  });
  it("enforces three search calls per UTC day, including failures, while allowing cache reuse", async () => {
    const s = await import("@/server/db/schema");
    const { refreshShelfFor } = await import("@/server/search/shelf");
    await refreshShelfFor(await viewer("b"), tags, "cache");
    for (let i = 0; i < 3; i++)
      await db.insert(s.agentRun).values({
        userId: "a",
        purpose: "search",
        model: "tavily",
        ok: false,
        createdAt: new Date(),
      });
    const v = await viewer();
    expect((await refreshShelfFor(v, tags, "cached")).count).toBe(3);
    expect((await refreshShelfFor(v, { goal: "energy" }, "cap")).ok).toBe(
      false,
    );
    expect(fake.search).toHaveBeenCalledTimes(1);
  });
  it("reserves searches at the real UTC instant with a non-UTC database clock", async () => {
    const s = await import("@/server/db/schema");
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const priorTimezone = await db.execute<{ timezone: string }>(
      sql`select current_setting('TimeZone') as timezone`,
    );
    try {
      await db.execute(sql`select set_config('TimeZone', 'Etc/GMT+6', false)`);
      const utcStart = new Date();
      utcStart.setUTCHours(0, 0, 0, 0);
      const yesterday = new Date(utcStart.getTime() - 1);
      for (let i = 0; i < 3; i++)
        await db.insert(s.agentRun).values({
          userId: "a",
          purpose: "search",
          model: "tavily",
          ok: false,
          createdAt: yesterday,
        });
      const v = await viewer();
      const before = Date.now();
      expect((await refreshShelfFor(v, tags, "clock")).count).toBe(3);
      const rows = await db
        .select()
        .from(s.agentRun)
        .where(eq(s.agentRun.userId, "a"));
      const reserved = rows.find((r) => r.ok)!;
      expect(reserved.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(reserved.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      for (let i = 0; i < 2; i++)
        await db.insert(s.agentRun).values({
          userId: "a",
          purpose: "search",
          model: "tavily",
          ok: false,
          createdAt: new Date(),
        });
      expect(
        (await refreshShelfFor(v, { goal: "energy" }, "clock-cap")).ok,
      ).toBe(false);
      expect(fake.search).toHaveBeenCalledTimes(1);
    } finally {
      await db.execute(
        sql`select set_config('TimeZone', ${priorTimezone.rows[0].timezone}, false)`,
      );
    }
  });
  it("handles search failure once per cooldown, then permits retry", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const s = await import("@/server/db/schema");
    const v = await viewer();
    fake.search.mockRejectedValue(new Error("network failed"));
    await refreshShelfFor(v, tags, "retry");
    await refreshShelfFor(v, tags, "retry");
    expect(fake.search).toHaveBeenCalledTimes(1);
    await db.update(s.shelfRefresh).set({ retryAt: new Date(0) });
    fake.search.mockResolvedValue({ results: hits });
    expect((await refreshShelfFor(v, tags, "retry")).count).toBe(3);
    expect(fake.search).toHaveBeenCalledTimes(2);
    const logs = await db
      .select()
      .from(s.agentRun)
      .where(eq(s.agentRun.userId, "a"));
    expect(logs.map((r) => r.ok)).toEqual([false, true]);
  });
  it("kill switches and coaching pause prevent searches while saved picks stay readable", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf, setShelfFeedback } = await import("@/server/data/shelf");
    const s = await import("@/server/db/schema");
    const v = await viewer();
    await refreshShelfFor(v, tags, "initial");
    const pick = (await getShelf(v)).current[0];
    await setShelfFeedback(db, "a", pick.id, "saved");
    fake.env.KOE_SEARCH = "off";
    expect((await refreshShelfFor(v, tags, "killed")).ok).toBe(false);
    expect((await getShelf(v)).saved).toHaveLength(1);
    expect((await getShelf(v)).current).toHaveLength(0);
    expect((await getShelf(v)).searchEnabled).toBe(false);
    fake.env.KOE_SEARCH = "on";
    fake.env.TAVILY_API_KEY = "";
    expect((await getShelf(v)).searchEnabled).toBe(false);
    fake.env.TAVILY_API_KEY = "fake-only";
    await db
      .update(s.profile)
      .set({ coachingPausedAt: new Date() })
      .where(eq(s.profile.userId, "a"));
    expect((await refreshShelfFor(v, tags, "paused")).ok).toBe(false);
    expect(fake.search).toHaveBeenCalledTimes(1);
  });
  it("feedback is owner-scoped, reversible once, and tunes later tag rotation", async () => {
    await model();
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf, setShelfFeedback, undoShelfFeedback } =
      await import("@/server/data/shelf");
    const s = await import("@/server/db/schema");
    const v = await viewer();
    await refreshShelfFor(v);
    const pick = (await getShelf(v)).current[0];
    expect(await setShelfFeedback(db, "b", pick.id, "not_for_me")).toBeNull();
    const token = (await setShelfFeedback(db, "a", pick.id, "not_for_me"))!;
    expect((await getShelf(v)).current).toHaveLength(2);
    expect(await undoShelfFeedback(db, "b", token)).toBe(false);
    expect(await undoShelfFeedback(db, "a", token)).toBe(true);
    expect(await undoShelfFeedback(db, "a", token)).toBe(false);
    await setShelfFeedback(db, "a", pick.id, "not_for_me");
    await db.delete(s.shelfRefresh);
    await db.update(s.shelfItem).set({ week: "old" });
    await refreshShelfFor(v);
    expect(fake.search.mock.calls[1][0]).not.toBe(fake.search.mock.calls[0][0]);
  });
  it("exports private rows, transfers duplicate URLs safely, and cascades deletion without touching global cache", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf, setShelfFeedback } = await import("@/server/data/shelf");
    const { transferOwnership } = await import("@/server/db/ownership");
    const s = await import("@/server/db/schema");
    await refreshShelfFor(await viewer(), tags, "same");
    const b = await viewer("b");
    await refreshShelfFor(b, tags, "same");
    await setShelfFeedback(db, "b", (await getShelf(b)).current[0].id, "saved");
    const { GET } = await import("@/app/api/export/route");
    const exported = await (await GET()).json();
    expect(exported.shelf).toHaveLength(3);
    expect(exported.shelf[0]).not.toHaveProperty("whyEnc");
    expect(exported.shelfRefreshes).toHaveLength(1);
    await transferOwnership(db, "a", "b");
    expect(
      await db.select().from(s.shelfItem).where(eq(s.shelfItem.userId, "a")),
    ).toHaveLength(0);
    expect((await getShelf(b)).saved).toHaveLength(1);
    await db.delete(s.user).where(eq(s.user.id, "b"));
    expect(await db.select().from(s.shelfItem)).toHaveLength(0);
    expect(await db.select().from(s.shelfRefresh)).toHaveLength(0);
    expect(await db.select().from(s.resourceCache)).toHaveLength(1);
  });
  it("allows stub fixtures only for exact localhost APP_URLs", async () => {
    const { searchStubbed } = await import("@/server/search/stub");
    process.env.KOE_SEARCH_STUB = "on";
    for (const url of [
      "https://koe.example",
      "http://localhost.evil.com",
      "http://user@localhost",
      "http://127.0.0.1/elsewhere",
    ]) {
      process.env.APP_URL = url;
      expect(searchStubbed()).toBe(false);
    }
    process.env.APP_URL = "http://127.0.0.1:3200";
    expect(searchStubbed()).toBe(true);
  });
});
