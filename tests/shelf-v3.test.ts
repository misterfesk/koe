// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
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

type Hit = {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string;
};
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
  articles: [] as Hit[],
  videos: [] as Hit[],
  channels: {} as Record<string, string>,
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
vi.mock("@/server/search/cover", async (original) => ({
  ...(await original<typeof import("@/server/search/cover")>()),
  ensureCovers: async () => {},
}));
vi.mock("@/server/llm/usage", () => ({
  aiBudgetLeft: async () => 200,
  recordRun: async () => {},
}));

let db: Db;
const TODAY = "2026-10-27";
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const article = (i: number): Hit => ({
  title: `Ideas for your day ${i}`,
  url: `https://www.nhs.uk/mental-health/ideas-${i}`,
  content:
    "A practical guide for adults who want ideas for everyday life with low mood. Find information about choosing something manageable for your day.",
  score: 1 - i / 100,
  rawContent: words(460),
});
const video = (id: string, title = "Low mood ideas for adults"): Hit => ({
  title,
  url: `https://www.youtube.com/watch?v=${id}`,
  content:
    "A short video for adults about ordinary ways to make everyday life with low mood more manageable at your own pace.",
  score: 1,
});

beforeAll(async () => {
  fake.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { openDb } = await import("@/server/db");
  db = await openDb("memory:");
  fake.db = db;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$client.close();
});
beforeEach(async () => {
  const s = await import("@/server/db/schema");
  await db.delete(s.user);
  await db.delete(s.resourceCache);
  await db.delete(s.shelfCoverCache);
  fake.articles = [1, 2, 3].map(article);
  fake.videos = [];
  fake.channels = {};
  fake.search
    .mockReset()
    .mockImplementation(
      async (_q: string, o: { includeDomains: string[] }) => ({
        results: o.includeDomains.includes("youtube.com")
          ? fake.videos
          : fake.articles,
      }),
    );
  fake.model
    .mockReset()
    .mockImplementation(
      async (_m: unknown, _s: unknown, o: { purpose: string }) =>
        o.purpose === "week_topic"
          ? { topic: "work" }
          : { ok: true, audience: "adult" },
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = new URL(
        new URL(url).searchParams.get("url")!,
      ).searchParams.get("v")!;
      return fake.channels[id]
        ? new Response(JSON.stringify({ author_url: fake.channels[id] }))
        : new Response("Not found", { status: 404 });
    }),
  );
  await db
    .insert(s.user)
    .values({ id: "a", name: "a", email: "a@test.invalid" });
  await db
    .insert(s.profile)
    .values({ userId: "a", region: "GB", onboardedAt: new Date() });
});
async function viewer(today = TODAY) {
  const s = await import("@/server/db/schema");
  const [profile] = await db
    .select()
    .from(s.profile)
    .where(eq(s.profile.userId, "a"));
  const v = { user: { id: "a" }, profile, db, today, isGuest: true } as Viewer;
  fake.current = v;
  return v;
}
async function chooseGoals() {
  const s = await import("@/server/db/schema");
  const { seal } = await import("@/server/crypto");
  const { intakeModel } = await import("@/domain/intake");
  await db.insert(s.userModel).values({
    userId: "a",
    dataEnc: seal(
      JSON.stringify(
        intakeModel.parse({ goals: ["enjoy_again"], lifts: ["music"] }),
      ),
    ),
    summaryEnc: seal("Secret personal summary"),
  });
}
async function addWeek(title: string, topic: string | null = null) {
  const s = await import("@/server/db/schema");
  const { seal } = await import("@/server/crypto");
  const [w] = await db
    .insert(s.week)
    .values({
      userId: "a",
      startedOn: TODAY,
      reviewOn: "2026-11-03",
      labelEnc: seal("This week"),
    })
    .returning();
  await db.insert(s.weekItem).values({
    userId: "a",
    weekId: w.id,
    capturedEnc: seal(JSON.stringify({ what: title, title })),
    order: 0,
    topic,
  });
}
/** Day one already ran on an earlier day, so today's open is the weekly one. */
async function dayOneEarlier() {
  const s = await import("@/server/db/schema");
  await db.insert(s.shelfRefresh).values({
    userId: "a",
    requestKey: "day1:2026-10-20",
    week: "2026-W43",
    tagsKey: "",
    outcome: "done",
  });
}
const sentQueries = () => fake.search.mock.calls.map((c) => c[0] as string);

describe("Shelf v3: day one", { timeout: 30000 }, () => {
  it("keeps 5 when the search returns 7", async () => {
    fake.articles = [1, 2, 3, 4, 5, 6, 7].map(article);
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    expect((await refreshShelfFor(v)).count).toBe(5);
    // At most 2 fixed-topic queries: a read and a video.
    expect(fake.search).toHaveBeenCalledTimes(2);
    const shelf = await getShelf(v);
    expect(shelf.current).toHaveLength(5);
    expect(shelf.refreshNeeded).toBe(false);
    expect(shelf.current[0]).toMatchObject({
      format: "article",
      readMinutes: 2,
      sourceName: "NHS",
      cover: { kind: "none" },
      forWeek: false,
    });
  });
  it("keeps 3 of 3, then exactly one top-up query on the next open that day, then none", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const v = await viewer();
    expect((await refreshShelfFor(v)).count).toBe(3);
    expect(fake.search).toHaveBeenCalledTimes(2);
    expect((await getShelf(v)).refreshNeeded).toBe(true);
    fake.articles = [4, 5].map(article);
    expect((await refreshShelfFor(v)).count).toBe(2);
    expect(fake.search).toHaveBeenCalledTimes(3);
    expect((await getShelf(v)).refreshNeeded).toBe(false);
    await refreshShelfFor(v);
    expect(fake.search).toHaveBeenCalledTimes(3);
    expect((await getShelf(v)).current).toHaveLength(5);
  });
  it("retries day one on a later open after search fails, and keeps saved picks honest", async () => {
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const s = await import("@/server/db/schema");
    fake.search.mockRejectedValue(new Error("network"));
    const v = await viewer();
    expect((await refreshShelfFor(v)).ok).toBe(false);
    expect((await getShelf(v)).refreshNeeded).toBe(false);
    await db.update(s.shelfRefresh).set({ retryAt: new Date(0) });
    expect((await getShelf(v)).refreshNeeded).toBe(true);
  });
  it("runs in the background after a save and exposes loading while it runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fake.search.mockImplementation(async () => {
      await gate;
      return { results: fake.articles };
    });
    const { startShelfAfterSave } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    const { refreshShelf } = await import("@/server/actions/shelf");
    const v = await viewer();
    startShelfAfterSave(v);
    const during = await getShelf(v);
    expect(during.loading).toBe(true);
    expect(during.refreshNeeded).toBe(false);
    // An open during the background run neither waits nor tops up.
    await refreshShelf();
    release();
    await vi.waitFor(async () =>
      expect((await getShelf(v)).loading).toBe(false),
    );
    expect((await getShelf(v)).current).toHaveLength(3);
    expect(fake.search).toHaveBeenCalledTimes(2);
  });
});

describe(
  "Shelf v3: why lines and this week's topics",
  { timeout: 30000 },
  () => {
    it("names only a chosen goal, and nothing with memory off", async () => {
      await chooseGoals();
      const { refreshShelfFor } = await import("@/server/search/shelf");
      const { getShelf } = await import("@/server/data/shelf");
      const s = await import("@/server/db/schema");
      await refreshShelfFor(await viewer());
      expect((await getShelf(await viewer())).current[0].why).toBe(
        'Because you chose "getting back to things you enjoyed"',
      );
      await db
        .update(s.profile)
        .set({ memoryOn: false })
        .where(eq(s.profile.userId, "a"));
      expect((await getShelf(await viewer())).current[0].why).toBe("");
    });
    it("classifies week things once, queries only the enum, and omits the title with memory off", async () => {
      await chooseGoals();
      await addWeek("Secret landlord email");
      await dayOneEarlier();
      const { classifyWeekTopics } =
        await import("@/server/search/week-topics");
      const { refreshShelfFor } = await import("@/server/search/shelf");
      const { getShelf } = await import("@/server/data/shelf");
      const s = await import("@/server/db/schema");
      await classifyWeekTopics(db, "a", true);
      await classifyWeekTopics(db, "a", true);
      expect(
        fake.model.mock.calls.filter((c) => c[2].purpose === "week_topic"),
      ).toHaveLength(1);
      expect((await db.select().from(s.weekItem))[0].topic).toBe("work");
      await refreshShelfFor(await viewer());
      expect(sentQueries()[0]).toBe(
        "coping with work when feeling low practical self-help guide for adults article",
      );
      expect(JSON.stringify(fake.search.mock.calls)).not.toMatch(
        /landlord|Secret/,
      );
      const shelf = await getShelf(await viewer());
      expect(shelf.weekTopics).toEqual(["work"]);
      const forWeek = shelf.current.filter((p) => p.forWeek);
      expect(forWeek.length).toBeGreaterThan(0);
      expect(forWeek[0]).toMatchObject({
        weekTopic: "work",
        why: 'For "Secret landlord email"',
      });
      const rows = JSON.stringify(await db.select().from(s.shelfItem));
      expect(rows).not.toContain("landlord");
      expect(
        JSON.stringify(await db.select().from(s.resourceCache)),
      ).not.toMatch(/landlord|Because|For "/);
      await db
        .update(s.profile)
        .set({ memoryOn: false })
        .where(eq(s.profile.userId, "a"));
      const off = await getShelf(await viewer());
      expect(off.weekTopics).toEqual([]);
      expect(off.current.every((p) => p.why === "")).toBe(true);
    });
    it("never classifies with memory off", async () => {
      await addWeek("Secret landlord email");
      const { classifyWeekTopics } =
        await import("@/server/search/week-topics");
      await classifyWeekTopics(db, "a", false);
      expect(fake.model).not.toHaveBeenCalled();
    });
    it("fills the weekly top-up towards 10 within the daily cap", async () => {
      await chooseGoals();
      await addWeek("Thing", "money");
      await dayOneEarlier();
      let n = 0;
      fake.search.mockImplementation(async () => ({
        results: [1, 2, 3, 4, 5, 6].map(() => article(++n)),
      }));
      const { refreshShelfFor } = await import("@/server/search/shelf");
      const { getShelf } = await import("@/server/data/shelf");
      expect((await refreshShelfFor(await viewer())).count).toBe(10);
      expect(fake.search).toHaveBeenCalledTimes(2);
      expect((await getShelf(await viewer())).current).toHaveLength(10);
      expect(sentQueries()[0]).toMatch(/^managing money worries/);
    });
  },
);

describe("Shelf v3: queries and videos", { timeout: 30000 }, () => {
  it("builds every query from the fixed vocabulary only", async () => {
    const {
      buildResourceQuery,
      queryVocabulary,
      resourceFormats,
      resourceGoals,
      resourceInterests,
      weekTopics,
    } = await import("@/domain/resources");
    for (const goal of resourceGoals)
      for (const interest of [...resourceInterests, undefined])
        for (const format of [...resourceFormats, undefined])
          for (const weekTopic of [...weekTopics, undefined])
            for (const word of buildResourceQuery({
              goal,
              interest,
              format,
              weekTopic,
            }).split(" "))
              expect(queryVocabulary.has(word), word).toBe(true);
    expect(() =>
      buildResourceQuery({ goal: "sleep", weekTopic: "landlord" } as never),
    ).toThrow();
  });
  it("keeps a video only from an allowlisted channel, with a YouTube cover", async () => {
    fake.videos = [video("allowedVid1"), video("otherVid001")];
    fake.channels = {
      allowedVid1: "https://www.youtube.com/@NHS",
      otherVid001: "https://www.youtube.com/@SomeoneElse",
    };
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const { getShelf } = await import("@/server/data/shelf");
    await refreshShelfFor(await viewer());
    const videos = (await getShelf(await viewer())).current.filter(
      (p) => p.format === "video",
    );
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      videoId: "allowedVid1",
      sourceName: "NHS",
      url: "https://www.youtube.com/watch?v=allowedVid1",
      cover: {
        kind: "youtube",
        src: "https://i.ytimg.com/vi/allowedVid1/hqdefault.jpg",
      },
    });
    expect(videos[0].readMinutes).toBeUndefined();
  });
  it("screens video titles too", async () => {
    fake.videos = [video("allowedVid1", "Low mood for teenagers")];
    fake.channels = { allowedVid1: "https://www.youtube.com/@NHS" };
    const { screenResources } = await import("@/server/search/screen");
    const { kept, rejected } = await screenResources(fake.videos, {
      goal: "sleep",
      format: "video",
    });
    expect(kept).toEqual([]);
    expect(rejected[0].reason).toBe("young audience");
  });
  it("rejects a cached video whose channel is not allowlisted", async () => {
    const { cachedResourceOk } = await import("@/domain/resource-screen");
    const row = {
      title: "A video",
      url: "https://www.youtube.com/watch?v=allowedVid1",
      host: "www.youtube.com",
      foodOrExercise: false,
      adult: true,
      aiScreened: true,
      format: "video",
      videoId: "allowedVid1",
      channel: "https://www.youtube.com/@NHS",
    };
    expect(cachedResourceOk(row, false, true)).toBe(true);
    expect(
      cachedResourceOk(
        { ...row, channel: "https://www.youtube.com/@Elsewhere" },
        false,
        true,
      ),
    ).toBe(false);
  });
});

describe("Shelf v3: export and delete", { timeout: 30000 }, () => {
  it("exports the new pick facts and week topics; deletion removes them and leaves the public cover cache", async () => {
    await addWeek("Thing", "work");
    fake.videos = [video("allowedVid1")];
    fake.channels = { allowedVid1: "https://www.youtube.com/@TEDEd" };
    const { refreshShelfFor } = await import("@/server/search/shelf");
    const s = await import("@/server/db/schema");
    await refreshShelfFor(await viewer());
    await db
      .insert(s.shelfCoverCache)
      .values({ key: "0".repeat(32), contentType: null, dataBase64: null });
    const { GET } = await import("@/app/api/export/route");
    const exported = await (await GET()).json();
    expect(
      exported.shelf.find((r: { format: string }) => r.format === "video"),
    ).toMatchObject({
      videoId: "allowedVid1",
      channel: "https://www.youtube.com/@TEDEd",
      readMinutes: null,
    });
    expect(
      exported.shelf.find((r: { format: string }) => r.format === "article")
        .readMinutes,
    ).toBe(2);
    expect(exported.weekThingTopics).toEqual([
      { weekItemId: expect.any(String), topic: "work" },
    ]);
    await db.delete(s.user).where(eq(s.user.id, "a"));
    expect(await db.select().from(s.shelfItem)).toHaveLength(0);
    expect(await db.select().from(s.weekItem)).toHaveLength(0);
    // Public, ownerless data keyed by a URL hash, like the result cache.
    expect(await db.select().from(s.shelfCoverCache)).toHaveLength(1);
  });
});
