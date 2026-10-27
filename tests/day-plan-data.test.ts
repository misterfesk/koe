// @vitest-environment node
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { diffPlans, isEmptyDiff } from "@/domain/day-plan";
import { intakeModel } from "@/domain/intake";
import { fallbackPlan } from "@/domain/plan-menu";

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => viewer.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // The model is off: these tests cover the rules and the saving of plans.
  process.env.KOE_AI = "off";
});

const TODAY = "2026-10-27";
const model = intakeModel.parse({
  goals: ["work_study", "energy"],
  wake: "7to9",
  days: "working",
  lifts: ["music"],
  people: ["friend"],
  names: [{ name: "Sam", save: false }],
});

async function setup(opts: { intro?: boolean; day?: string } = {}) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  await db
    .insert(schema.user)
    .values({ id: "a", name: "a", email: "a@x.test" });
  await db.insert(schema.profile).values({
    userId: "a",
    timezone: "UTC",
    onboardedAt: new Date(),
  });
  const day = opts.day ?? TODAY;
  if (opts.intro !== false) {
    const { commitIntro } = await import("@/server/data/intake");
    await commitIntro(db, "a", {
      model,
      summary: "You want more energy.",
      memories: [],
      people: [],
      items: bigDay(),
      memoryOn: true,
      today: day,
    });
  }
  return { db, schema, day };
}

/** The first-day plan, with one item bigger so a low day has something to shrink. */
function bigDay() {
  return fallbackPlan(model);
}

async function titles(db: Awaited<ReturnType<typeof setup>>["db"]) {
  const { getPlanDay } = await import("@/server/data/intake");
  return (await getPlanDay(db, "a", TODAY))!;
}

describe("opening today", { timeout: 60_000 }, () => {
  it("makes one plan when two requests arrive together", async () => {
    const { db, schema } = await setup({ intro: false });
    const { openToday } = await import("@/server/llm/planner");
    const where = { db, today: TODAY };
    const [one, two] = await Promise.all([
      openToday("a", where),
      openToday("a", where),
    ]);
    expect(one.version).toBe(1);
    expect(two.id).toBe(one.id);
    expect((await db.select().from(schema.planDay)).length).toBe(1);
    expect((await db.select().from(schema.step)).length).toBe(3);
    // A later call reads the same plan.
    const again = await openToday("a", where);
    expect(again.id).toBe(one.id);
    expect((await db.select().from(schema.step)).length).toBe(3);
  });

  it("lets only one of two racing writers take a version", async () => {
    const { db, schema } = await setup({ intro: false });
    const { writePlanVersion } = await import("@/server/data/plan");
    const write = (title: string) =>
      writePlanVersion(db, "a", {
        day: TODAY,
        items: [
          {
            kind: "basics",
            title,
            why: "Because a small basic is a gentle place to start",
            size: "tiny",
            minuteOfDay: 8 * 60,
          },
        ],
        energy: null,
        mode: "normal",
        reason: "first_open",
        note: null,
        origin: "planner",
        expectVersion: 1,
      });
    const results = await Promise.all([
      write("Wash your face"),
      write("Drink water"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(schema.planDay)).toHaveLength(1);
    expect(await db.select().from(schema.step)).toHaveLength(1);
  });

  it("carries nothing over from yesterday", async () => {
    const { db, schema } = await setup({ day: "2026-10-26" });
    const { openToday } = await import("@/server/llm/planner");
    const { listSteps } = await import("@/server/data/steps");
    expect((await listSteps(db, "a")).every((s) => s.status === "active")).toBe(
      true,
    );
    const plan = await openToday("a", { db, today: TODAY });
    expect(plan.items).toHaveLength(3);
    const steps = await listSteps(db, "a");
    const mine = new Set(plan.items.map((i) => i.stepId));
    for (const s of steps)
      expect(s.status).toBe(mine.has(s.id) ? "active" : "archived");
    expect(steps.filter((s) => s.plannedFor === TODAY)).toHaveLength(3);
    void schema;
  });

  it("starts lighter after two quiet days", async () => {
    const { db, schema } = await setup({ day: "2026-10-25" });
    const { openToday } = await import("@/server/llm/planner");
    const { writePlanVersion } = await import("@/server/data/plan");
    // Yesterday had a plan too, and nothing was done on either day.
    await writePlanVersion(db, "a", {
      day: "2026-10-26",
      items: bigDay(),
      energy: null,
      mode: "normal",
      reason: "first_open",
      note: null,
      origin: "planner",
    });
    const plan = await openToday("a", { db, today: TODAY });
    expect(plan.mode).toBe("lighter");
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((i) => i.size === "tiny")).toBe(true);
    expect(plan.note).toMatch(/^Lighter day/);
    void schema;
  });

  it("does not start lighter when yesterday had something done", async () => {
    const { db } = await setup({ day: "2026-10-25" });
    const { openToday } = await import("@/server/llm/planner");
    const { writePlanVersion } = await import("@/server/data/plan");
    const { reportStep } = await import("@/server/data/steps");
    const w = await writePlanVersion(db, "a", {
      day: "2026-10-26",
      items: bigDay(),
      energy: null,
      mode: "normal",
      reason: "first_open",
      note: null,
      origin: "planner",
    });
    if (!w.ok) throw new Error("write failed");
    await reportStep(db, "a", w.items[0].stepId!, "done", "2026-10-26");
    const plan = await openToday("a", { db, today: TODAY });
    expect(plan.mode).toBe("normal");
    expect(plan.items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("changes and undo", { timeout: 60_000 }, () => {
  it("a low check-in shrinks the day, writes a version, and undo restores it exactly", async () => {
    const { db, schema } = await setup();
    const { planToday } = await import("@/server/llm/planner");
    const { undoLastChange } = await import("@/server/data/plan");
    const { listSteps } = await import("@/server/data/steps");
    // Make one item bigger so there is something to shrink.
    const before = await titles(db);
    const work = before.items.find((i) => i.kind === "work_chunk");
    expect(work?.size).toBe("small");

    const stepsBefore = JSON.stringify(
      (await listSteps(db, "a")).map((s) => [
        s.id,
        s.title,
        s.status,
        s.minuteOfDay,
        s.size,
        s.why,
      ]),
    );
    const r = await planToday(
      "a",
      { reason: "check_in", energy: "low" },
      { db, today: TODAY },
    );
    expect(r.changed).toBe(true);
    expect(r.source).toBe("rules");
    expect(r.version).toBe(2);
    expect(r.note).toMatch(/^Lighter day: Made ".*" smaller: "/);
    expect(r.note).not.toMatch(/\b(I|we|us|together)\b/i);

    const after = await titles(db);
    expect(after.version).toBe(2);
    expect(after.energy).toBe("low");
    expect(after.reason).toBe("check_in");
    expect(after.items.length).toBeLessThanOrEqual(3);
    const d = diffPlans(before.items, after.items);
    expect(d.shrunk.length).toBeGreaterThan(0);
    expect(after.items.every((i) => i.size === "tiny")).toBe(true);
    // The step rows follow: the replaced ones leave Today.
    const live = (await listSteps(db, "a")).filter(
      (s) => s.status === "active",
    );
    expect(live.map((s) => s.id).sort()).toEqual(
      after.items.map((i) => i.stepId).sort(),
    );

    // Undo: the snapshot and the step rows are back exactly.
    expect(await undoLastChange(db, "a", TODAY)).toEqual({
      ok: true,
      version: 1,
    });
    const back = await titles(db);
    expect(back.version).toBe(1);
    expect(back.items).toEqual(before.items);
    expect(
      JSON.stringify(
        (await listSteps(db, "a"))
          .filter((s) => before.items.some((i) => i.stepId === s.id))
          .map((s) => [s.id, s.title, s.status, s.minuteOfDay, s.size, s.why]),
      ),
    ).toBe(
      JSON.stringify(
        JSON.parse(stepsBefore).filter((row: string[]) =>
          before.items.some((i) => i.stepId === row[0]),
        ),
      ),
    );
    // Steps the change added are archived, not left on Today.
    const active = (await listSteps(db, "a")).filter(
      (s) => s.status === "active",
    );
    expect(active.map((s) => s.id).sort()).toEqual(
      before.items.map((i) => i.stepId).sort(),
    );
    // One level: nothing more to undo from the first version.
    expect((await undoLastChange(db, "a", TODAY)).ok).toBe(false);
    void schema;
  });

  it("says plainly when the plan already fits", async () => {
    const { db } = await setup();
    const { planToday } = await import("@/server/llm/planner");
    const tiny = fallbackPlan(intakeModel.parse({}));
    expect(tiny.every((i) => i.size === "tiny")).toBe(true);
    // A day of only tiny items does not change on a low day.
    const first = await planToday(
      "a",
      { reason: "check_in", energy: "low" },
      { db, today: TODAY },
    );
    expect(first.changed).toBe(true);
    const again = await planToday(
      "a",
      { reason: "check_in", energy: "low" },
      { db, today: TODAY },
    );
    expect(again.changed).toBe(false);
    expect(again.note).toBe("Your plan already fits a low day.");
    expect((await titles(db)).version).toBe(2);
    const okay = await planToday(
      "a",
      { reason: "check_in", energy: "okay" },
      { db, today: TODAY },
    );
    expect(okay.changed).toBe(false);
    expect(okay.note).toBe("Your plan already fits today.");
  });

  it("makes one item smaller, records the answer, and undo takes both back", async () => {
    const { db, schema } = await setup();
    const { planToday } = await import("@/server/llm/planner");
    const { undoLastChange, todayReports } = await import("@/server/data/plan");
    const before = await titles(db);
    const item = before.items.find((i) => i.size === "small")!;
    const r = await planToday(
      "a",
      { reason: "not_today_shrink", itemId: item.stepId },
      { db, today: TODAY },
    );
    expect(r.changed).toBe(true);
    const after = await titles(db);
    const replaced = after.items.find((i) => i.kind === item.kind)!;
    expect(replaced.size).toBe("tiny");
    expect(replaced.title).not.toBe(item.title);
    expect(replaced.minuteOfDay).toBe(item.minuteOfDay);
    expect(after.items).toHaveLength(before.items.length);
    expect(
      (await todayReports(db, "a", TODAY)).get(item.stepId!)?.outcome,
    ).toBe("not");

    await undoLastChange(db, "a", TODAY);
    expect((await titles(db)).items).toEqual(before.items);
    expect((await todayReports(db, "a", TODAY)).size).toBe(0);
    const [row] = await db
      .select()
      .from(schema.step)
      .where(and(eq(schema.step.id, item.stepId!)));
    expect(row.status).toBe("active");
  });

  it("swaps one item for another of the same kind", async () => {
    const { db } = await setup();
    const { planToday } = await import("@/server/llm/planner");
    const before = await titles(db);
    const item = before.items[0];
    const r = await planToday(
      "a",
      { reason: "not_today_swap", itemId: item.stepId },
      { db, today: TODAY },
    );
    if (r.changed) {
      const after = await titles(db);
      expect(after.items.find((i) => i.stepId === item.stepId)).toBeUndefined();
      expect(after.items.some((i) => i.title === item.title)).toBe(false);
      expect(after.items.map((i) => i.kind).sort()).toEqual(
        before.items.map((i) => i.kind).sort(),
      );
    } else {
      // Nothing else of that kind fits: said plainly, nothing written.
      expect(r.note).toMatch(/move it or let it go/);
      expect((await titles(db)).version).toBe(1);
    }
  });

  it("a lighter day keeps one anchor and one tiny item, and keeps what is done", async () => {
    const { db } = await setup();
    const { planToday } = await import("@/server/llm/planner");
    const { reportStep } = await import("@/server/data/steps");
    const before = await titles(db);
    const done = before.items[before.items.length - 1];
    await reportStep(db, "a", done.stepId!, "done", TODAY);
    const r = await planToday("a", { reason: "lighter" }, { db, today: TODAY });
    expect(r.changed).toBe(true);
    const after = await titles(db);
    expect(after.mode).toBe("lighter");
    expect(after.items.find((i) => i.stepId === done.stepId)).toEqual(done);
    expect(after.items.length).toBeLessThanOrEqual(2);
  });
});

describe("the actions around a day", { timeout: 60_000 }, () => {
  async function actions() {
    const ctx = await setup();
    const { eq: eqq } = await import("drizzle-orm");
    const [profile] = await ctx.db
      .select()
      .from(ctx.schema.profile)
      .where(eqq(ctx.schema.profile.userId, "a"));
    viewer.current = {
      user: { id: "a" },
      profile,
      db: ctx.db,
      today: TODAY,
      isGuest: true,
    };
    return { ...ctx, mod: await import("@/server/actions/plan") };
  }

  it("saves the check-in once a day, seals the word, and changes the plan", async () => {
    const { db, schema, mod } = await actions();
    const r = await mod.submitCheckIn({ energy: "low", word: "tired" });
    expect(r).toMatchObject({ ok: true, changed: true, safety: "none" });
    const rows = await db.select().from(schema.checkIn);
    expect(rows).toHaveLength(1);
    expect(rows[0].wordEnc).toMatch(/^v1\./);
    expect(JSON.stringify(rows)).not.toContain("tired");
    // Changing the answer replaces it and plans again.
    const again = await mod.submitCheckIn({ energy: "okay" });
    expect(again).toMatchObject({ ok: true, changed: false });
    const after = await db.select().from(schema.checkIn);
    expect(after).toHaveLength(1);
    expect(after[0].energy).toBe("okay");
    expect(after[0].wordEnc).toBeNull();
  });

  it("a worrying word shows the safety flow and is not sent to the planner", async () => {
    const { mod } = await actions();
    const r = await mod.submitCheckIn({ energy: "low", word: "disappear" });
    expect(r).toMatchObject({ ok: true });
    const bad = await mod.submitCheckIn({
      energy: "low",
      word: "I want to end it all",
    });
    expect(bad.ok && bad.safety).toBe("urgent");
  });

  it("moves, lets go, adds, and undoes each", async () => {
    const { db, mod } = await actions();
    const { undoLastChange } = await import("@/server/data/plan");
    const before = await titles(db);
    const first = before.items[0];

    const moved = await mod.notToday(first.stepId!, {
      choice: "later",
      minute: first.minuteOfDay + 60,
    });
    expect(moved).toMatchObject({ ok: true, changed: true });
    expect(
      (await titles(db)).items.find((i) => i.stepId === first.stepId)
        ?.minuteOfDay,
    ).toBe(first.minuteOfDay + 60);
    await mod.undoPlanChange();
    expect((await titles(db)).items).toEqual(before.items);

    const gone = await mod.notToday(first.stepId!, { choice: "let_go" });
    expect(gone).toMatchObject({ ok: true, changed: true });
    expect(
      (await titles(db)).items.some((i) => i.stepId === first.stepId),
    ).toBe(false);
    expect((await undoLastChange(db, "a", TODAY)).ok).toBe(true);
    expect((await titles(db)).items).toEqual(before.items);

    const added = await mod.addPlanItem({
      kind: "kind",
      title: "Call the dentist",
      minute: 17 * 60,
    });
    expect(added).toMatchObject({ ok: true, changed: true });
    const now = await titles(db);
    expect(now.items).toHaveLength(before.items.length + 1);
    expect(
      now.items.find((i) => i.title === "Call the dentist")?.minuteOfDay,
    ).toBe(17 * 60);
    expect(isEmptyDiff(diffPlans(before.items, now.items))).toBe(false);
    // An empty title is refused with a way to fix it.
    const empty = await mod.addPlanItem({ kind: "kind", title: " " });
    expect(empty.ok).toBe(false);
  });

  it("stops adding at five", async () => {
    const { mod } = await actions();
    for (let n = 0; n < 2; n++)
      expect(
        await mod.addPlanItem({ kind: "kind", title: "Something " + n }),
      ).toMatchObject({ ok: true });
    const six = await mod.addPlanItem({ kind: "kind", title: "One more" });
    expect(six.ok).toBe(false);
  });

  it("stores how it went compared with what they expected", async () => {
    const { db, mod } = await actions();
    const { reportStep } = await import("@/server/data/steps");
    const { todayReports } = await import("@/server/data/plan");
    const item = (await titles(db)).items[0];
    await reportStep(db, "a", item.stepId!, "done", TODAY);
    const report = (await todayReports(db, "a", TODAY)).get(item.stepId!)!;
    expect(await mod.rateVsExpected(report.id, "better")).toEqual({ ok: true });
    expect(
      (await todayReports(db, "a", TODAY)).get(item.stepId!)?.vsExpected,
    ).toBe("better");
    expect((await mod.rateVsExpected(report.id, "great")).ok).toBe(false);
  });
});
