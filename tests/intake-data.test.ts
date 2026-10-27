// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { intakeModel, type IntakeInput } from "@/domain/intake";
import { fallbackPlan } from "@/domain/plan-menu";

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  getViewer: async () => viewer.current,
}));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const TODAY = "2026-10-27";

async function setup() {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  for (const id of ["a", "b"])
    await db
      .insert(schema.user)
      .values({ id, name: id, email: id + "@example.com" });
  return { db, schema };
}

const answers: IntakeInput = {
  goals: ["energy"],
  wake: "7to9",
  lifts: ["music"],
  people: ["friend"],
  names: [
    { name: "Sam", save: true },
    { name: "Priya", save: false },
  ],
  tone: "calm",
  morningPlan: "08:00",
};

async function commit(
  db: Awaited<ReturnType<typeof setup>>["db"],
  userId = "a",
  over: Partial<{
    memoryOn: boolean;
    memories: { kind: "helps" | "people"; text: string }[];
    people: string[];
  }> = {},
) {
  const { commitIntro } = await import("@/server/data/intake");
  const model = intakeModel.parse(answers);
  return commitIntro(db, userId, {
    model,
    summary: "You want more energy. Music used to lift you.",
    memories: over.memories ?? [
      { kind: "helps", text: "Music used to lift you." },
    ],
    people: over.people ?? ["Sam"],
    items: fallbackPlan(model),
    memoryOn: over.memoryOn ?? true,
    today: TODAY,
  });
}

describe("Start my day", { timeout: 30_000 }, () => {
  it("writes exactly what the person approved", async () => {
    const { db, schema } = await setup();
    const intake = await import("@/server/data/intake");
    const steps = await import("@/server/data/steps");
    const memory = await import("@/server/data/memory");
    const people = await import("@/server/data/people");

    expect(await intake.hasIntro(db, "a")).toBe(false);
    expect(await commit(db)).toEqual({ already: false });
    expect(await intake.hasIntro(db, "a")).toBe(true);

    const model = await intake.getUserModel(db, "a");
    expect(model?.summary).toBe(
      "You want more energy. Music used to lift you.",
    );
    expect(model?.model.lifts).toEqual(["music"]);
    expect(model?.model.morningPlan).toBe("08:00");
    expect(model?.version).toBe(1);

    // One memory card, from the intro; one person, the one ticked.
    const cards = await memory.listMemory(db, "a");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ source: "intro", kind: "helps" });
    expect((await people.listPeople(db, "a")).map((p) => p.name)).toEqual([
      "Sam",
    ]);

    // Three steps for today, with the plan fields, and a matching plan_day.
    const list = await steps.listSteps(db, "a");
    expect(list).toHaveLength(3);
    for (const s of list) {
      expect(s.plannedFor).toBe(TODAY);
      expect(s.repeatDays).toBeNull();
      expect(s.origin).toBe("intro");
      expect(s.kind).toBeTruthy();
      expect(s.why).toMatch(/^Because/);
      expect(s.minuteOfDay).toBeGreaterThan(0);
      expect(["tiny", "small"]).toContain(s.size);
    }
    const day = await intake.getPlanDay(db, "a", TODAY);
    expect(day?.version).toBe(1);
    expect(day?.mode).toBe("normal");
    expect(day?.items.map((i) => i.stepId).sort()).toEqual(
      list.map((s) => s.id).sort(),
    );
    expect(day?.items.map((i) => i.title).sort()).toEqual(
      list.map((s) => s.title).sort(),
    );

    // Nothing for the other person.
    expect(await steps.listSteps(db, "b")).toHaveLength(0);
    expect(await intake.getUserModel(db, "b")).toBeNull();
    void schema;
  });

  it("writes nothing the second time", async () => {
    const { db } = await setup();
    const steps = await import("@/server/data/steps");
    await commit(db);
    expect(await commit(db)).toEqual({ already: true });
    expect(await steps.listSteps(db, "a")).toHaveLength(3);
  });

  it("remembers nothing about the person when memory is off, but still plans the day", async () => {
    const { db } = await setup();
    const intake = await import("@/server/data/intake");
    const steps = await import("@/server/data/steps");
    const memory = await import("@/server/data/memory");
    await commit(db, "a", { memoryOn: false });
    expect(await intake.getUserModel(db, "a")).toBeNull();
    expect(await memory.listMemory(db, "a")).toHaveLength(0);
    expect(await steps.listSteps(db, "a")).toHaveLength(3);
  });

  it("saves no one when no name was ticked", async () => {
    const { db } = await setup();
    const people = await import("@/server/data/people");
    await commit(db, "a", { people: [] });
    expect(await people.listPeople(db, "a")).toHaveLength(0);
  });

  it("stores the model, summary, why lines and snapshot encrypted", async () => {
    const { db, schema } = await setup();
    await commit(db);
    const raw = JSON.stringify([
      await db.select().from(schema.userModel),
      await db.select().from(schema.planDay),
      await db.select().from(schema.step),
      await db.select().from(schema.memoryCard),
      await db.select().from(schema.person),
    ]);
    expect(raw).not.toMatch(/Music used to lift|Because you|Priya|more energy/);
    expect(raw).toMatch(/v1\./);
  });
});

describe("what Koe knows is the person's to export, move and delete", () => {
  it("includes the user model and plan days in the export", async () => {
    const { db } = await setup();
    await commit(db);
    const { getUserModel } = await import("@/server/data/intake");
    const { profile } = await import("@/server/db/schema");
    await db.insert(profile).values({ userId: "a", timezone: "UTC" });
    const [p] = await db.select().from(profile).where(eq(profile.userId, "a"));
    viewer.current = {
      user: { id: "a", email: "a@example.com", createdAt: new Date() },
      profile: p,
      db,
      today: TODAY,
      isGuest: true,
    };
    const { GET } = await import("@/app/api/export/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userModel.summary).toMatch(/more energy/);
    expect(body.userModel.model.names[0].name).toBe("Sam");
    expect(body.planDays).toHaveLength(1);
    expect(body.planDays[0].items).toHaveLength(3);
    expect(body.steps).toHaveLength(3);
    expect(body.steps[0]).toHaveProperty("why");
    expect(body.memoryCards[0].source).toBe("intro");
    expect(await getUserModel(db, "a")).not.toBeNull();
  });

  it("clears them with the account", async () => {
    const { db, schema } = await setup();
    await commit(db);
    await db.delete(schema.user).where(eq(schema.user.id, "a"));
    for (const table of [
      schema.userModel,
      schema.planDay,
      schema.step,
      schema.memoryCard,
      schema.person,
    ]) {
      const [row] = (
        await db.execute(sql`select count(*)::int as n from ${table}`)
      ).rows as { n: number }[];
      expect(row.n).toBe(0);
    }
  });

  it("moves them from a guest to the account they sign up with", async () => {
    const { db, schema } = await setup();
    const { transferOwnership } = await import("@/server/db/ownership");
    const intake = await import("@/server/data/intake");
    const steps = await import("@/server/data/steps");
    await commit(db, "a");
    await transferOwnership(db, "a", "b");
    expect((await intake.getUserModel(db, "b"))?.summary).toMatch(/energy/);
    expect(await intake.getUserModel(db, "a")).toBeNull();
    expect(await intake.getPlanDay(db, "b", TODAY)).not.toBeNull();
    expect(await steps.listSteps(db, "b")).toHaveLength(3);
    for (const table of schema.movableTables) {
      const [row] = (
        await db.execute(
          sql`select count(*)::int as n from ${table} where user_id = 'a'`,
        )
      ).rows as { n: number }[];
      expect(row.n).toBe(0);
    }
  });

  it("keeps the account's own model and plan when both have one", async () => {
    const { db } = await setup();
    const { transferOwnership } = await import("@/server/db/ownership");
    const intake = await import("@/server/data/intake");
    await commit(db, "a");
    const { commitIntro } = intake;
    const own = intakeModel.parse({ goals: ["sleep"] });
    await commitIntro(db, "b", {
      model: own,
      summary: "Your own summary.",
      memories: [],
      people: [],
      items: fallbackPlan(own),
      memoryOn: true,
      today: TODAY,
    });
    await transferOwnership(db, "a", "b");
    expect((await intake.getUserModel(db, "b"))?.summary).toBe(
      "Your own summary.",
    );
    const days = await intake.listPlanDays(db, "b");
    expect(days).toHaveLength(1);
    expect(days[0].items.length).toBe(3);
  });
});

describe(
  "signing in with a guest that has a morning plan reminder",
  { timeout: 30_000 },
  () => {
    it("keeps the account's morning plan reminder and drops the guest's", async () => {
      const { db, schema } = await setup();
      const { transferOwnership } = await import("@/server/db/ownership");
      const { setMorningReminder, listReminders } =
        await import("@/server/data/reminders");
      await setMorningReminder(db, "a", 9 * 60, "UTC");
      await setMorningReminder(db, "b", 8 * 60, "UTC");
      await expect(transferOwnership(db, "a", "b")).resolves.toBeUndefined();
      const mine = (await listReminders(db, "b")).filter(
        (r) => r.kind === "morning_plan",
      );
      expect(mine).toHaveLength(1);
      expect(mine[0].minuteOfDay).toBe(8 * 60);
      const left = await db
        .select()
        .from(schema.reminder)
        .where(eq(schema.reminder.userId, "a"));
      expect(left).toHaveLength(0);
    });

    it("moves the guest's morning plan reminder when the account has none", async () => {
      const { db } = await setup();
      const { transferOwnership } = await import("@/server/db/ownership");
      const { setMorningReminder, listReminders } =
        await import("@/server/data/reminders");
      await setMorningReminder(db, "a", 9 * 60, "UTC");
      await transferOwnership(db, "a", "b");
      const mine = await listReminders(db, "b");
      expect(mine.map((r) => [r.kind, r.minuteOfDay])).toEqual([
        ["morning_plan", 9 * 60],
      ]);
    });
  },
);

describe(
  "one day never mixes plan versions from a guest and an account",
  { timeout: 30_000 },
  () => {
    it("keeps all of the account's versions of a day, and none of the guest's", async () => {
      const { db } = await setup();
      const { transferOwnership } = await import("@/server/db/ownership");
      const intake = await import("@/server/data/intake");
      const { writePlanVersion } = await import("@/server/data/plan");
      const items = fallbackPlan(intakeModel.parse(answers));
      await commit(db, "a");
      await commit(db, "b");
      const edit = (n: number) =>
        items.map((i) => ({
          ...i,
          title: i.title + " " + n,
          stepId: undefined,
        }));
      // The account's day has versions 1 and 2; the guest's has 1, 2 and 3.
      await writePlanVersion(db, "b", {
        day: TODAY,
        items: edit(2),
        energy: null,
        mode: "normal",
        reason: "add",
        note: null,
        origin: "you",
      });
      await writePlanVersion(db, "a", {
        day: TODAY,
        items: edit(12),
        energy: null,
        mode: "normal",
        reason: "add",
        note: null,
        origin: "you",
      });
      await writePlanVersion(db, "a", {
        day: TODAY,
        items: edit(13),
        energy: null,
        mode: "normal",
        reason: "add",
        note: null,
        origin: "you",
      });
      await transferOwnership(db, "a", "b");
      const days = (await intake.listPlanDays(db, "b")).filter(
        (d) => d.day === TODAY,
      );
      expect(days.map((d) => d.version).sort()).toEqual([1, 2]);
      expect(days.find((d) => d.version === 2)!.items[0].title).toMatch(/ 2$/);
      expect(JSON.stringify(days)).not.toMatch(/ 1[23]"/);
    });
  },
);

describe("context packet", { timeout: 30_000 }, () => {
  it("is small, ordered and stable, and includes what the person approved", async () => {
    const { db } = await setup();
    const { buildContext } = await import("@/server/llm/context");
    const steps = await import("@/server/data/steps");
    const { profile } = await import("@/server/db/schema");
    await db.insert(profile).values({ userId: "a", tone: "calm" });
    await commit(db);
    const [first] = await steps.listSteps(db, "a");
    await steps.reportStep(db, "a", first.id, "done", TODAY);

    const one = await buildContext(db, "a", TODAY);
    const two = await buildContext(db, "a", TODAY);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(Object.keys(one)).toEqual([
      "v",
      "tone",
      "memory",
      "intake",
      "summary",
      "memories",
      "outcomes7d",
      "today",
    ]);
    expect(one.memory).toBe("on");
    expect(one.intake).toMatchObject({ lifts: ["music"], tone: "calm" });
    expect(one.summary).toMatch(/energy/);
    expect(one.memories).toEqual([
      { kind: "helps", text: "Music used to lift you." },
    ]);
    expect(one.today?.items).toHaveLength(3);
    const counts = Object.values(one.outcomes7d);
    expect(counts).toHaveLength(1);
    expect(counts[0].done).toBe(1);
    expect(JSON.stringify(one).length).toBeLessThan(4000);
  });

  it("holds nothing personal when memory is off", async () => {
    const { db } = await setup();
    const { buildContext } = await import("@/server/llm/context");
    const { profile } = await import("@/server/db/schema");
    await db.insert(profile).values({ userId: "a", memoryOn: false });
    await commit(db, "a", { memoryOn: false });
    const packet = await buildContext(db, "a", TODAY);
    expect(packet.memory).toBe("off");
    expect(packet.intake).toBeUndefined();
    expect(packet.summary).toBeUndefined();
    expect(packet.memories).toBeUndefined();
    expect(JSON.stringify(packet)).not.toMatch(/Because|song|Sam/);
    expect(packet.today?.items[0]).not.toHaveProperty("title");
  });
});
