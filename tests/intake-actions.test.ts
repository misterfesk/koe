import { introAnchor } from "@/domain/week-picker";
// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { intakeModel, type IntakeInput } from "@/domain/intake";
import { checkComposition, contextFor, fallbackPlan } from "@/domain/plan-menu";

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => viewer.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // The model is off: these tests cover the rules around it.
  process.env.KOE_AI = "off";
});

const TODAY = "2026-10-27";

async function setup(memoryOn = true) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  await db
    .insert(schema.user)
    .values({ id: "a", name: "a", email: "a@example.com" });
  await db.insert(schema.profile).values({
    userId: "a",
    timezone: "UTC",
    memoryOn,
    onboardedAt: new Date(),
  });
  const reload = async () => {
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, "a"));
    viewer.current = {
      user: { id: "a" },
      profile,
      db,
      today: TODAY,
      isGuest: true,
    };
  };
  await reload();
  return { db, schema, reload };
}

async function reveal(input: IntakeInput) {
  const { buildReveal } = await import("@/server/actions/intake");
  const r = await buildReveal(input);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
}

describe("buildReveal", { timeout: 30_000 }, () => {
  it("makes a reveal with three items from the answers", async () => {
    await setup();
    const r = await reveal({
      goals: ["energy"],
      lifts: ["music"],
      wake: "7to9",
    });
    expect(r.safety).toBe("none");
    const model = intakeModel.parse({
      goals: ["energy"],
      lifts: ["music"],
      wake: "7to9",
    });
    expect(r.reveal?.items).toHaveLength(3);
    expect(checkComposition(r.reveal!.items, contextFor(model))).toEqual([]);
    expect(r.reveal?.source).toBe("fallback");
    expect(r.reveal?.summary).toMatch(/^You/);
  });

  it("works with every question skipped", async () => {
    await setup();
    const r = await reveal({});
    expect(r.reveal?.items).toHaveLength(3);
    expect(r.reveal?.memories).toEqual([]);
  });

  it("shows the safety flow for risky words and builds nothing", async () => {
    const { db, schema } = await setup();
    const r = await reveal({ notes: { goals: "I want to end it all" } });
    expect(r.safety).not.toBe("none");
    expect(r.reveal).toBeNull();
    const events = await db.select().from(schema.safetyEvent);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: "intake", source: "rules" });
    const [p] = await db.select().from(schema.profile);
    expect(p.coachingPausedAt).not.toBeNull();
  });

  it("screens a single answer as it is given", async () => {
    const { db, schema } = await setup();
    const { checkIntakeText } = await import("@/server/actions/intake");
    expect((await checkIntakeText(["music and walks"])).safety).toBe("none");
    expect(
      (await checkIntakeText(["I keep thinking about suicide"])).safety,
    ).not.toBe("none");
    expect(await db.select().from(schema.safetyEvent)).toHaveLength(1);
  });

  it("flags an eating concern, drops those words and keeps food and movement out", async () => {
    await setup();
    const r = await reveal({
      goals: ["energy", "basics"],
      lifts: ["cooking", "walking", "music"],
      puttingOff: "I have been restricting my food",
      notes: { day: "busy mornings" },
      people: ["friend"],
      names: [{ name: "Alex", save: false }],
    });
    expect(r.reveal?.eatingConcern).toBe(true);
    expect(r.reveal?.model.eatingConcern).toBe(true);
    expect(r.reveal?.model.puttingOff).toBeUndefined();
    expect(r.reveal?.model.notes.day).toBe("busy mornings");
    const kinds = r.reveal!.items.map((i) => i.kind);
    expect(kinds).not.toContain("move");
    for (const i of r.reveal!.items)
      expect(i.title + i.why).not.toMatch(
        /\b(eat|meal|food|cook|walk|stretch)\w*/i,
      );
    expect(JSON.stringify(r.reveal)).not.toMatch(/restricting/);
  });

  it("makes no memory proposals when memory is off", async () => {
    await setup(false);
    const r = await reveal({
      lifts: ["music"],
      names: [{ name: "Sam" }],
      people: ["friend"],
    });
    expect(r.reveal?.memories).toEqual([]);
  });

  it("keeps memory-off and deliberate Skip reveals local", async () => {
    const llm = await import("@/server/llm/intake");
    const synth = vi.spyOn(llm, "synthesiseIntake");
    await setup(false);
    expect((await reveal({ puttingOff: "Update the CV" })).reveal?.source).toBe(
      "fallback",
    );
    await setup(true);
    const { buildReveal } = await import("@/server/actions/intake");
    expect(
      await buildReveal({ puttingOff: "Update the CV" }, true),
    ).toMatchObject({ ok: true, reveal: { source: "fallback" } });
    expect(synth).not.toHaveBeenCalled();
    synth.mockRestore();
  });

  it("rejects answers outside the choices", async () => {
    await setup();
    const { buildReveal } = await import("@/server/actions/intake");
    const r = await buildReveal({ wake: "noon" });
    expect(r.ok).toBe(false);
  });
});

describe("startMyDay", { timeout: 30_000 }, () => {
  const model = intakeModel.parse({
    goals: ["energy"],
    lifts: ["music"],
    wake: "7to9",
    tone: "calm",
    names: [{ name: "Sam", save: true }],
  });
  const payload = () => ({
    model,
    summary: "You want more energy.",
    memories: [{ kind: "helps", text: "Music used to lift you." }],
    savePeople: ["Sam", "Someone Else"],
    items: fallbackPlan(model),
  });
  const run = async (input: unknown) => {
    const { startMyDay } = await import("@/server/actions/intake");
    try {
      return await startMyDay(input);
    } catch (e) {
      return (e as Error).message;
    }
  };

  const proposed = async (weekId?: string, expectedVersion?: number) => {
    const { startInterview, advanceInterview } =
      await import("@/server/actions/interview");
    const start = await startInterview({
      intake: model,
      ...(weekId ? { weekId, expectedVersion } : {}),
    });
    if (!start.ok || !start.token) throw new Error("start failed");
    const answer = await advanceInterview({
      token: start.token,
      text: "Update the CV",
      intent: "answer",
    });
    if (!answer.ok || !answer.token) throw new Error("answer failed");
    const week = await advanceInterview({
      token: answer.token,
      intent: "finish",
    });
    if (!week.ok || !week.token || !week.draft)
      throw new Error("proposal failed");
    return { token: week.token, draft: week.draft };
  };

  it("saves intro and confirmed week atomically and keeps a retry idempotent", async () => {
    const { db, schema } = await setup();
    const interview = await proposed();
    const original = interview.draft.items[0].captured.what;
    interview.draft.items[0].captured.title = "Refresh the CV";
    interview.draft.items[0].captured.what = "forged words";
    expect(await run({ ...payload(), interview })).toEqual({ ok: true });
    expect(await db.select().from(schema.week)).toHaveLength(1);
    expect(await db.select().from(schema.weekItem)).toHaveLength(1);
    expect(await db.select().from(schema.piece)).toHaveLength(0);
    expect(await db.select().from(schema.planDay)).toHaveLength(1);
    const { getWeek } = await import("@/server/data/week");
    const [row] = await db.select().from(schema.week);
    const approved = await getWeek(db, "a", row.id);
    expect(approved!.items[0].captured).toEqual({
      what: original,
      when: "",
      title: "Refresh the CV",
    });
    expect(await run({ ...payload(), interview })).toEqual({ ok: true });
    expect(await db.select().from(schema.weekItem)).toHaveLength(1);
    expect(await db.select().from(schema.planDay)).toHaveLength(1);
  });

  it("a week saved with the intro shapes day 1: its things plus one intro anchor", async () => {
    const { db, schema } = await setup();
    const interview = await proposed();
    const { introDay } = await import("@/domain/week-picker");
    const preview = introDay(
      payload().items,
      interview.draft.items,
      model.wake,
    );
    expect(await run({ ...payload(), interview })).toEqual({ ok: true });
    const { getPlanDay } = await import("@/server/data/intake");
    const [day] = await db.select().from(schema.planDay);
    const plan = (await getPlanDay(db, "a", day.day))!;
    const [thing] = await db.select().from(schema.weekItem);
    const things = plan.items.filter((i) => i.weekItemId);
    expect(things.map((i) => [i.title, i.weekItemId])).toEqual([
      [interview.draft.items[0].captured.title, thing.id],
    ]);
    expect(things[0].why).toMatch(/^Because you said "/);
    const others = plan.items.filter((i) => !i.weekItemId);
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject(introAnchor(payload().items)!);
    expect(
      plan.items.filter(
        (i) => !i.weekItemId && ["task", "work_chunk"].includes(i.kind),
      ),
    ).toEqual([]);
    // The reveal preview is the same list.
    expect(
      plan.items.map(({ title, why, minuteOfDay }) => [
        title,
        why,
        minuteOfDay,
      ]),
    ).toEqual(
      preview.map(({ title, why, minuteOfDay }) => [title, why, minuteOfDay]),
    );
    const steps = await db.select().from(schema.step);
    expect(steps.filter((r) => r.weekItemId === thing.id)).toHaveLength(1);
  });

  it("does not save either half when the interview token is foreign or expired", async () => {
    const { db, schema } = await setup();
    expect(
      await run({ ...payload(), interview: { token: "expired", draft: {} } }),
    ).toMatchObject({ ok: false });
    expect(await db.select().from(schema.userModel)).toHaveLength(0);
    expect(await db.select().from(schema.planDay)).toHaveLength(0);
    expect(await db.select().from(schema.week)).toHaveLength(0);
  });

  it("does not write an intro while coaching is paused", async () => {
    const { db, schema, reload } = await setup();
    await db
      .update(schema.profile)
      .set({ coachingPausedAt: new Date() })
      .where(eq(schema.profile.userId, "a"));
    await reload();
    expect(await run(payload())).toEqual({ ok: true, safety: "concern" });
    expect(await db.select().from(schema.planDay)).toHaveLength(0);
    expect(await db.select().from(schema.userModel)).toHaveLength(0);
  });

  it("rolls back the intro when the confirmed week changed in another tab", async () => {
    const { db, schema } = await setup();
    const { saveInterviewWeek } = await import("@/server/actions/interview");
    const saved = await saveInterviewWeek(await proposed());
    if (!saved.ok || !saved.week) throw new Error("save failed");
    const interview = await proposed(saved.week.id, saved.week.version);
    await db
      .update(schema.week)
      .set({ version: saved.week.version + 1 })
      .where(eq(schema.week.id, saved.week.id));
    expect(await run({ ...payload(), interview })).not.toEqual({ ok: true });
    expect(await db.select().from(schema.userModel)).toHaveLength(0);
    expect(await db.select().from(schema.planDay)).toHaveLength(0);
    expect(await db.select().from(schema.weekItem)).toHaveLength(1);
  });

  it("writes the approved things and returns success for draft cleanup", async () => {
    const { db, schema } = await setup();
    expect(await run(payload())).toEqual({ ok: true });
    expect(await db.select().from(schema.userModel)).toHaveLength(1);
    expect(await db.select().from(schema.step)).toHaveLength(3);
    expect(await db.select().from(schema.planDay)).toHaveLength(1);
    // The tone chosen in the intro becomes their setting.
    const [settings] = await db.select().from(schema.profile);
    expect(settings.tone).toBe("calm");
    expect(await db.select().from(schema.memoryCard)).toHaveLength(1);
    // Only a name that was in the answers can be saved.
    expect(await db.select().from(schema.person)).toHaveLength(1);
    // A second tap changes nothing.
    expect(await run(payload())).toEqual({ ok: true });
    expect(await db.select().from(schema.step)).toHaveLength(3);
  });

  it("does not save a morning plan reminder inside quiet hours, and says so in the reveal", async () => {
    const { db, schema } = await setup();
    await db.insert(schema.pushSubscription).values({
      userId: "a",
      endpoint: "https://fcm.googleapis.com/fcm/send/test-a",
      p256dh: "p256dh-test-key",
      auth: "auth-test",
    });
    // The default quiet hours are 22:00 to 08:00, so 07:00 would never arrive.
    const [p] = await db.select().from(schema.profile);
    expect([p.quietStart, p.quietEnd]).toEqual([22 * 60, 8 * 60]);
    const built = await reveal({ goals: ["energy"], morningPlan: "07:00" });
    expect(built.reveal?.reminderRules).toMatchObject({
      quietStart: 22 * 60,
      quietEnd: 8 * 60,
    });
    expect(await run({ ...payload(), morningPlanMinute: 7 * 60 })).toEqual({
      ok: true,
    });
    expect(await db.select().from(schema.reminder)).toHaveLength(0);
  });

  it("saves a morning plan reminder outside quiet hours", async () => {
    const { db, schema } = await setup();
    await db.insert(schema.pushSubscription).values({
      userId: "a",
      endpoint: "https://fcm.googleapis.com/fcm/send/test-a",
      p256dh: "p256dh-test-key",
      auth: "auth-test",
    });
    expect(await run({ ...payload(), morningPlanMinute: 9 * 60 })).toEqual({
      ok: true,
    });
    const rows = await db.select().from(schema.reminder);
    expect(rows.map((r) => [r.kind, r.minuteOfDay])).toEqual([
      ["morning_plan", 9 * 60],
    ]);
  });

  it("writes only what was kept when the person unticks a memory and removes an item", async () => {
    const { db, schema } = await setup();
    const p = payload();
    expect(
      await run({
        ...p,
        memories: [],
        items: p.items.slice(0, 2),
        savePeople: [],
      }),
    ).toEqual({ ok: true });
    expect(await db.select().from(schema.memoryCard)).toHaveLength(0);
    expect(await db.select().from(schema.person)).toHaveLength(0);
    expect(await db.select().from(schema.step)).toHaveLength(2);
  });

  it("shows the safety flow for risky edits and writes nothing", async () => {
    const { db, schema } = await setup();
    const r = await run({ ...payload(), summary: "I want to end it all" });
    expect(r).toMatchObject({
      ok: true,
      safety: expect.stringMatching(/concern|urgent/),
    });
    expect(await db.select().from(schema.userModel)).toHaveLength(0);
    expect(await db.select().from(schema.step)).toHaveLength(0);
    expect(await db.select().from(schema.safetyEvent)).toHaveLength(1);
  });

  it("refuses a plan that breaks the guardrails or the eating rule", async () => {
    const { db, schema } = await setup();
    const p = payload();
    const bad = [
      { ...p.items[0], title: "Count your calories today" },
      ...p.items.slice(1),
    ];
    expect(await run({ ...p, items: bad })).toMatchObject({ ok: false });
    const eating = intakeModel.parse({ eatingConcern: true });
    expect(
      await run({
        ...p,
        model: eating,
        items: [
          { ...p.items[0], kind: "move", title: "Stretch for two minutes" },
          ...p.items.slice(1),
        ],
      }),
    ).toMatchObject({ ok: false });
    expect(await db.select().from(schema.step)).toHaveLength(0);
  });

  it("keeps the model and cards out when memory is off but still plans the day", async () => {
    const { db, schema } = await setup(false);
    expect(await run(payload())).toEqual({ ok: true });
    expect(await db.select().from(schema.userModel)).toHaveLength(0);
    expect(await db.select().from(schema.memoryCard)).toHaveLength(0);
    expect(await db.select().from(schema.step)).toHaveLength(3);
  });
});
