import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeading } from "@/components/ui";
import {
  DeviceNotifications,
  QuietHours,
  ReminderRow,
} from "@/features/settings/reminders";
import { listReminders, subscriptionsFor } from "@/server/data/reminders";
import { listSteps } from "@/server/data/steps";
import { env } from "@/server/env";
import { pushConfigured } from "@/server/push";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Reminders" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const v = await requireViewer();
  const focus = (await searchParams).step;
  const [steps, reminders, subs] = await Promise.all([
    listSteps(v.db, v.user.id),
    listReminders(v.db, v.user.id),
    subscriptionsFor(v.db, [v.user.id]),
  ]);
  const active = steps.filter((s) => s.status === "active");
  return (
    <>
      <PageHeading
        eyebrow="Settings · Reminders"
        description="Only reminders you set. They pause themselves if a few go unanswered, so they never pile up."
      >
        Reminders
      </PageHeading>
      <DeviceNotifications
        publicKey={pushConfigured() ? env().VAPID_PUBLIC_KEY! : null}
        subscribed={subs.length > 0}
      />
      <section aria-labelledby="for-steps">
        <h2 id="for-steps">Your steps</h2>
        {active.length === 0 ? (
          <Empty>
            No steps to remind you about.{" "}
            <Link href="/today">Choose one on Today</Link>.
          </Empty>
        ) : (
          <ul className="rows">
            {active.map((s) => (
              <ReminderRow
                key={s.id}
                step={{ id: s.id, title: s.title, repeatDays: s.repeatDays }}
                reminder={reminders.find((r) => r.stepId === s.id)}
                focus={focus === s.id}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="quiet" style={{ marginTop: 32 }}>
        <h2 id="quiet">Quiet hours</h2>
        <p className="hint">No reminders arrive during these hours.</p>
        <QuietHours start={v.profile.quietStart} end={v.profile.quietEnd} />
      </section>
      <p className="meta">
        Lock-screen text never says what your step is: just &ldquo;A reminder
        you set.&rdquo; Times use {v.profile.timezone}.
      </p>
    </>
  );
}
