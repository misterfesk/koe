import "server-only";
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { IGNORE_LIMIT, inQuietHours, nextReminderAt } from "@/domain/reminders";
import { localDay, localMinutes } from "@/domain/time";
import type { Db } from "./db";
import { reminder, stepReport } from "./db/schema";
import {
  deleteSubscription,
  dueReminders,
  subscriptionsFor,
} from "./data/reminders";
import { env } from "./env";

export function pushConfigured() {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

// Lock screens are public: the text never includes what the step is.
const PAYLOAD = JSON.stringify({
  title: "Koe",
  body: "A reminder you set.",
  url: "/today",
});

export async function sendTo(
  db: Db,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload = PAYLOAD,
) {
  const e = env();
  let delivered = 0;
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
      delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // The browser unsubscribed or the subscription expired.
      if (status === 404 || status === 410)
        await deleteSubscription(db, s.endpoint);
    }
  }
  return delivered;
}

/**
 * Sends reminders that are due and schedules the next one. Skips a reminder
 * when the step was already answered today, coaching is paused after a
 * safety signal, or it falls in quiet hours. After IGNORE_LIMIT reminders in
 * a row with no answer, the reminder pauses itself instead of nagging.
 */
export async function runDueReminders(db: Db, now = new Date()) {
  if (!pushConfigured()) return 0;
  const due = await dueReminders(db, now);
  let sent = 0;
  for (const row of due) {
    const r = row.reminder;
    const next = nextReminderAt(r, row.timezone, now);
    const today = localDay(row.timezone, now);
    const [answered] = await db
      .select({ id: stepReport.id })
      .from(stepReport)
      .where(and(eq(stepReport.stepId, r.stepId), eq(stepReport.day, today)));
    const skip =
      row.stepStatus !== "active" ||
      !!row.paused ||
      !!answered ||
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
        .set({ nextAt: next })
        .where(eq(reminder.id, r.id));
      continue;
    }
    // ignoredCount = reminders sent since the step was last answered.
    if (r.ignoredCount >= IGNORE_LIMIT) {
      await db
        .update(reminder)
        .set({ paused: true, nextAt: next })
        .where(eq(reminder.id, r.id));
      continue;
    }
    const subs = await subscriptionsFor(db, [r.userId]);
    const delivered = subs.length ? await sendTo(db, subs) : 0;
    await db
      .update(reminder)
      .set({
        nextAt: next,
        lastSentAt: delivered ? now : r.lastSentAt,
        ignoredCount: r.ignoredCount + (delivered ? 1 : 0),
      })
      .where(eq(reminder.id, r.id));
    sent += delivered ? 1 : 0;
  }
  return sent;
}
