// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { intakeModel } from "@/domain/intake";
import { fallbackPlan } from "@/domain/plan-menu";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.KOE_AI = "off";
  // Record pushes instead of calling a push service.
  process.env.KOE_PUSH_STUB = "on";
});

const TODAY = "2026-10-27";
const model = intakeModel.parse({
  goals: ["work_study", "energy"],
  wake: "7to9",
  days: "working",
  lifts: ["music"],
  people: ["friend"],
});

async function setup(opts: { intro?: boolean; timezone?: string } = {}) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  await db
    .insert(schema.user)
    .values({ id: "a", name: "a", email: "a@x.test" });
  await db.insert(schema.profile).values({
    userId: "a",
    timezone: opts.timezone ?? "UTC",
    onboardedAt: new Date(),
  });
  await db.insert(schema.pushSubscription).values({
    userId: "a",
    endpoint: "https://fcm.googleapis.com/fcm/send/test-a",
    p256dh: "p256dh-test-key",
    auth: "auth-test",
  });
  if (opts.intro !== false) {
    const { commitIntro } = await import("@/server/data/intake");
    await commitIntro(db, "a", {
      model,
      summary: "You want more energy.",
      memories: [],
      people: [],
      items: fallbackPlan(model),
      memoryOn: true,
      today: TODAY,
    });
  }
  return { db, schema };
}

describe("reminders follow the plan", { timeout: 60_000 }, () => {
  it("moves with its item, and goes quiet when the item is swapped", async () => {
    const { db, schema } = await setup();
    const { getPlanDay } = await import("@/server/data/intake");
    const { setReminder, listReminders } =
      await import("@/server/data/reminders");
    const { writePlanVersion, undoLastChange } =
      await import("@/server/data/plan");
    const { planToday } = await import("@/server/llm/planner");
    const { listSteps } = await import("@/server/data/steps");

    const plan = (await getPlanDay(db, "a", TODAY))!;
    const first = plan.items[0];
    await setReminder(
      db,
      "a",
      {
        stepId: first.stepId!,
        minuteOfDay: first.minuteOfDay,
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      "UTC",
    );

    // Moving the item to later moves its reminder.
    const later = first.minuteOfDay + 120;
    const moved = await writePlanVersion(db, "a", {
      day: TODAY,
      items: plan.items.map((i) =>
        i === first ? { ...i, minuteOfDay: later } : i,
      ),
      energy: plan.energy,
      mode: plan.mode,
      reason: "not_today_move",
      note: null,
      origin: "you",
      expectVersion: plan.version + 1,
    });
    expect(moved.ok).toBe(true);
    let [r] = await listReminders(db, "a");
    expect(r.minuteOfDay).toBe(later);
    expect(r.nextAt).not.toBeNull();

    // Undo puts it back where it was.
    await undoLastChange(db, "a", TODAY);
    [r] = await listReminders(db, "a");
    expect(r.minuteOfDay).toBe(first.minuteOfDay);
    expect(r.nextAt).not.toBeNull();

    // A swap archives the old item. Its reminder stops and does not pass to the new one.
    const before = { minute: r.minuteOfDay, days: r.days, paused: r.paused };
    const swapped = await planToday(
      "a",
      { reason: "not_today_swap", itemId: first.stepId! },
      { db, today: TODAY },
    );
    expect(swapped.changed).toBe(true);
    const steps = await listSteps(db, "a");
    expect(steps.find((s) => s.id === first.stepId)?.status).toBe("archived");
    const all = await db.select().from(schema.reminder);
    expect(all).toHaveLength(1);
    expect(all[0].stepId).toBe(first.stepId);
    expect(all[0].nextAt).toBeNull();
    const now = (await getPlanDay(db, "a", TODAY))!;
    expect(now.items.some((i) => i.stepId === first.stepId)).toBe(false);

    // Undo after the swap: the reminder is the same as before the swap.
    const undone = await undoLastChange(db, "a", TODAY);
    expect(undone.ok).toBe(true);
    const [back] = await db.select().from(schema.reminder);
    expect(back.id).toBe(r.id);
    expect(back.minuteOfDay).toBe(before.minute);
    expect(back.days).toEqual(before.days);
    expect(back.paused).toBe(before.paused);
    expect(back.nextAt).not.toBeNull();
    expect(
      (await listSteps(db, "a")).find((s) => s.id === first.stepId)?.status,
    ).toBe("active");
  });
});

describe("sending due reminders", { timeout: 60_000 }, () => {
  const at = (iso: string) => new Date(iso);

  async function morning(
    db: Awaited<ReturnType<typeof setup>>["db"],
    schema: Awaited<ReturnType<typeof setup>>["schema"],
    nextAt: string,
    extra: Partial<typeof schema.reminder.$inferInsert> = {},
  ) {
    await db.insert(schema.reminder).values({
      userId: "a",
      kind: "morning_plan",
      minuteOfDay: 8 * 60,
      days: [0, 1, 2, 3, 4, 5, 6],
      nextAt: at(nextAt),
      ...extra,
    });
  }

  it("sends the morning plan reminder once a day, with neutral text", async () => {
    const { db, schema } = await setup({ intro: false });
    const { runDueReminders, recordedPushes } = await import("@/server/push");
    await morning(db, schema, "2026-10-27T08:00:00Z");
    const before = recordedPushes().length;
    expect(await runDueReminders(db, at("2026-10-27T08:01:00Z"))).toBe(1);
    const sent = recordedPushes().slice(before);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].payload)).toEqual({
      title: "Koe",
      body: "Your day is ready.",
      url: "/today",
    });
    const [r] = await db.select().from(schema.reminder);
    expect(r.nextAt?.toISOString()).toBe("2026-10-28T08:00:00.000Z");

    // The budget is used up for today: a second time the same day is skipped.
    await db
      .update(schema.reminder)
      .set({ nextAt: at("2026-10-27T08:05:00Z") });
    expect(await runDueReminders(db, at("2026-10-27T08:06:00Z"))).toBe(0);
  });

  it("skips quiet hours, long-overdue reminders and a budget of zero", async () => {
    const { db, schema } = await setup({ intro: false });
    const { runDueReminders } = await import("@/server/push");
    // 23:00 UTC is inside the default quiet hours (22:00 to 08:00).
    await morning(db, schema, "2026-10-27T22:59:00Z", { minuteOfDay: 23 * 60 });
    expect(await runDueReminders(db, at("2026-10-27T23:00:00Z"))).toBe(0);
    // More than 30 minutes late (server was down): skipped, not sent late.
    await db
      .update(schema.reminder)
      .set({ nextAt: at("2026-10-27T09:00:00Z") });
    expect(await runDueReminders(db, at("2026-10-27T10:00:00Z"))).toBe(0);
    // Nudge budget of zero: never.
    await db.update(schema.profile).set({ nudgesPerDay: 0 });
    await db
      .update(schema.reminder)
      .set({ nextAt: at("2026-10-28T08:00:00Z") });
    expect(await runDueReminders(db, at("2026-10-28T08:01:00Z"))).toBe(0);
  });

  it("pauses itself after a few go unanswered and says so", async () => {
    const { db, schema } = await setup({ intro: false });
    const { runDueReminders } = await import("@/server/push");
    await morning(db, schema, "2026-10-27T08:00:00Z", {
      ignoredCount: 3,
      lastSentAt: at("2026-10-26T08:00:00Z"),
    });
    expect(await runDueReminders(db, at("2026-10-27T08:01:00Z"))).toBe(0);
    const [r] = await db.select().from(schema.reminder);
    expect(r.paused).toBe(true);
  });

  it("opening Today counts as an answer and skips that day's reminder", async () => {
    const { db, schema } = await setup({ intro: true });
    const { runDueReminders } = await import("@/server/push");
    await morning(db, schema, "2026-10-27T08:00:00Z");
    // No quiet hours, so the only reason to skip is that today was opened.
    await db.update(schema.profile).set({ quietStart: 0, quietEnd: 0 });
    const planned = (await db.select().from(schema.planDay))[0].createdAt;
    const now = new Date(planned.getTime() + 60_000);
    await db
      .update(schema.reminder)
      .set({ nextAt: new Date(now.getTime() - 60_000) });
    expect(await runDueReminders(db, now)).toBe(0);
  });

  it("item reminders do not use the nudge budget and fire once", async () => {
    const { db, schema } = await setup({ intro: true });
    const { getPlanDay } = await import("@/server/data/intake");
    const { runDueReminders, recordedPushes } = await import("@/server/push");
    // The morning reminder already went today and the budget is 1.
    await morning(db, schema, "2026-10-28T08:00:00Z", {
      lastSentAt: at("2026-10-27T08:00:00Z"),
    });
    const plan = (await getPlanDay(db, "a", TODAY))!;
    const item = plan.items[0];
    await db.insert(schema.reminder).values({
      userId: "a",
      kind: "item",
      stepId: item.stepId!,
      minuteOfDay: 15 * 60,
      days: [0, 1, 2, 3, 4, 5, 6],
      nextAt: at("2026-10-27T15:00:00Z"),
    });
    const before = recordedPushes().length;
    expect(await runDueReminders(db, at("2026-10-27T15:01:00Z"))).toBe(1);
    const body = JSON.parse(recordedPushes()[before].payload).body;
    expect(body).toBe("A reminder for 15:00.");
    expect(body).not.toContain(item.title);
    const r = (
      await db
        .select()
        .from(schema.reminder)
        .where(eq(schema.reminder.kind, "item"))
    )[0];
    // A one-off item never comes back for another day.
    expect(r.nextAt).toBeNull();
  });

  it("moving timezone reschedules both kinds", async () => {
    const { db, schema } = await setup({ intro: false });
    const { rescheduleAll } = await import("@/server/data/reminders");
    await morning(db, schema, "2026-10-28T08:00:00Z");
    await rescheduleAll(db, "a", "Asia/Singapore");
    const [r] = await db.select().from(schema.reminder);
    expect(r.nextAt!.getUTCHours()).toBe(0);
  });
});
