import "server-only";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { nextReminderAt } from "@/domain/reminders";
import type { Db } from "../db";
import { profile, pushSubscription, reminder, step } from "../db/schema";

export type ReminderView = {
  id: string;
  stepId: string;
  minuteOfDay: number;
  days: number[];
  paused: boolean;
  ignoredCount: number;
  nextAt: string | null;
};

export async function listReminders(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(reminder)
    .where(eq(reminder.userId, userId));
  return rows.map((r): ReminderView => ({
    id: r.id,
    stepId: r.stepId,
    minuteOfDay: r.minuteOfDay,
    days: r.days,
    paused: r.paused,
    ignoredCount: r.ignoredCount,
    nextAt: r.nextAt?.toISOString() ?? null,
  }));
}

/** One reminder per step; setting it again replaces the time and days. */
export async function setReminder(
  db: Db,
  userId: string,
  input: { stepId: string; minuteOfDay: number; days: number[] },
  timezone: string,
) {
  const [owned] = await db
    .select({ id: step.id })
    .from(step)
    .where(and(eq(step.userId, userId), eq(step.id, input.stepId)));
  if (!owned) return false;
  const nextAt = nextReminderAt(input, timezone, new Date());
  await db
    .insert(reminder)
    .values({ userId, ...input, nextAt })
    .onConflictDoUpdate({
      target: reminder.stepId,
      set: {
        minuteOfDay: input.minuteOfDay,
        days: input.days,
        nextAt,
        paused: false,
        ignoredCount: 0,
      },
    });
  return true;
}

export async function pauseReminder(
  db: Db,
  userId: string,
  id: string,
  paused: boolean,
  timezone: string,
) {
  const [r] = await db
    .select()
    .from(reminder)
    .where(and(eq(reminder.userId, userId), eq(reminder.id, id)));
  if (!r) return;
  await db
    .update(reminder)
    .set({
      paused,
      ignoredCount: 0,
      nextAt: paused ? r.nextAt : nextReminderAt(r, timezone, new Date()),
    })
    .where(eq(reminder.id, id));
}

export async function deleteReminder(db: Db, userId: string, id: string) {
  await db
    .delete(reminder)
    .where(and(eq(reminder.userId, userId), eq(reminder.id, id)));
}

/** The person answered: reminders for this step start counting again. */
export async function resetIgnored(db: Db, userId: string, stepId: string) {
  await db
    .update(reminder)
    .set({ ignoredCount: 0 })
    .where(and(eq(reminder.userId, userId), eq(reminder.stepId, stepId)));
}

export async function saveSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
) {
  await db
    .insert(pushSubscription)
    .values({ userId, ...sub })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
}

export async function deleteSubscription(db: Db, endpoint: string) {
  await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint));
}

export async function subscriptionsFor(db: Db, userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select()
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, userIds));
}

/** Reminders whose time has come, with what's needed to decide and reschedule. */
export async function dueReminders(db: Db, now: Date) {
  return db
    .select({
      reminder,
      stepStatus: step.status,
      repeatDays: step.repeatDays,
      timezone: profile.timezone,
      quietStart: profile.quietStart,
      quietEnd: profile.quietEnd,
      paused: profile.coachingPausedAt,
    })
    .from(reminder)
    .innerJoin(step, eq(step.id, reminder.stepId))
    .innerJoin(profile, eq(profile.userId, reminder.userId))
    .where(
      and(
        eq(reminder.paused, false),
        isNotNull(reminder.nextAt),
        lte(reminder.nextAt, now),
      ),
    )
    .limit(500);
}
