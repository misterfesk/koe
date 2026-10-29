import "server-only";
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import {
  canSendKoeNudge,
  IGNORE_LIMIT,
  inQuietHours,
  nextReminderAt,
  remindsOnce,
  reminderPayload,
  zonedInstant,
} from "@/domain/reminders";
import { localDay, localMinutes } from "@/domain/time";
import type { Db } from "./db";
import { reminder, stepReport } from "./db/schema";
import {
  deleteSubscription,
  dueReminders,
  openedSince,
  subscriptionsFor,
} from "./data/reminders";
import { env } from "./env";
import { isLocalAppUrl } from "./local-only";

/**
 * A test setting: "on" records what would be sent instead of calling a push
 * service. Honoured only on a local server, so a stray flag on a hosted app
 * can't silently swallow real reminders.
 */
const stubbed = () => process.env.KOE_PUSH_STUB === "on" && isLocalAppUrl();

type Recorded = { endpoint: string; payload: string };
const sentLog = () => {
  const g = globalThis as unknown as { __koePushLog?: Recorded[] };
  return (g.__koePushLog ??= []);
};
/** What the stub recorded (for tests). */
export const recordedPushes = () => sentLog();

export function pushConfigured() {
  if (stubbed()) return true;
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

// Lock screens are public: the text never says what the entry is.
const PAYLOAD = JSON.stringify({
  title: "Koe",
  body: "A reminder you set.",
  url: "/today",
});

export type SendResult = {
  delivered: number;
  /** The push service answered with an error for this many devices. */
  refused: number;
  /** Devices whose subscription had expired and was removed. */
  expired: number;
  /** The status the push service gave, for the last refusal. */
  status?: number;
};

export async function sendDetailed(
  db: Db,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload = PAYLOAD,
): Promise<SendResult> {
  const out: SendResult = { delivered: 0, refused: 0, expired: 0 };
  if (stubbed()) {
    for (const s of subs) sentLog().push({ endpoint: s.endpoint, payload });
    out.delivered = subs.length;
    return out;
  }
  const e = env();
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        {
          vapidDetails: {
            subject: e.VAPID_SUBJECT,
            publicKey: e.VAPID_PUBLIC_KEY!,
            privateKey: e.VAPID_PRIVATE_KEY!,
          },
          TTL: 60 * 60,
          // One unresponsive endpoint must not stall everyone's reminders.
          timeout: 10_000,
        },
      );
      out.delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      out.status = status;
      // The browser unsubscribed or the subscription expired.
      if (status === 404 || status === 410) {
        await deleteSubscription(db, s.endpoint);
        out.expired++;
      } else out.refused++;
    }
  }
  return out;
}

export async function sendTo(
  db: Db,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload = PAYLOAD,
) {
  return (await sendDetailed(db, subs, payload)).delivered;
}

/**
 * Sends reminders that are due and schedules the next one. Skips a reminder
 * when the entry was already answered today (or, for the morning plan, today
 * was already opened), coaching is paused after a safety signal, or it falls
 * in quiet hours. A long-overdue one is skipped, not sent late. After
 * IGNORE_LIMIT reminders in a row with no answer, the reminder pauses itself
 * instead of nagging. Only the morning plan reminder is a Koe nudge and uses
 * the daily budget; reminders for an entry the person chose do not.
 */
export async function runDueReminders(db: Db, now = new Date()) {
  if (!pushConfigured()) return 0;
  const due = await dueReminders(db, now);
  let sent = 0;
  for (const row of due) {
    const r = row.reminder;
    const morning = r.kind === "morning_plan";
    // A one-off entry reminds once; it never comes back for another day.
    const once = remindsOnce(r.kind, row.repeatDays);
    const next = once ? null : nextReminderAt(r, row.timezone, now);
    const today = localDay(row.timezone, now);
    const answered = morning
      ? await openedSince(db, r.userId, zonedInstant(row.timezone, today, 0))
      : r.stepId
        ? (
            await db
              .select({ id: stepReport.id })
              .from(stepReport)
              .where(
                and(eq(stepReport.stepId, r.stepId), eq(stepReport.day, today)),
              )
          ).length > 0
        : false;
    // Reminders sent since the person last responded; opening Today after a
    // morning plan reminder counts as a response.
    let ignored = r.ignoredCount;
    if (morning && r.lastSentAt && ignored > 0)
      if (await openedSince(db, r.userId, r.lastSentAt)) ignored = 0;
    const sentToday =
      morning && r.lastSentAt && localDay(row.timezone, r.lastSentAt) === today
        ? 1
        : 0;
    const skip =
      (!morning && row.stepStatus !== "active") ||
      (once && row.plannedFor !== null && row.plannedFor !== today) ||
      !!row.paused ||
      !!answered ||
      (morning && !canSendKoeNudge(row.nudgesPerDay, sentToday)) ||
      // After downtime, a reminder that is long overdue is skipped, not sent late.
      now.getTime() - (r.nextAt?.getTime() ?? 0) > 30 * 60_000 ||
      inQuietHours(
        localMinutes(row.timezone, now),
        row.quietStart,
        row.quietEnd,
      );
    if (skip) {
      await db
        .update(reminder)
        .set({ nextAt: next, ignoredCount: ignored })
        .where(eq(reminder.id, r.id));
      continue;
    }
    if (ignored >= IGNORE_LIMIT) {
      await db
        .update(reminder)
        .set({ paused: true, nextAt: next })
        .where(eq(reminder.id, r.id));
      continue;
    }
    const subs = await subscriptionsFor(db, [r.userId]);
    const delivered = subs.length
      ? await sendTo(
          db,
          subs,
          JSON.stringify(reminderPayload(r.kind, r.minuteOfDay)),
        )
      : 0;
    await db
      .update(reminder)
      .set({
        nextAt: next,
        lastSentAt: delivered ? now : r.lastSentAt,
        ignoredCount: ignored + (delivered ? 1 : 0),
      })
      .where(eq(reminder.id, r.id));
    sent += delivered ? 1 : 0;
  }
  return sent;
}
