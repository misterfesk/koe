import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Empty, PageHeading } from "@/components/ui";
import { inQuietHours } from "@/domain/reminders";
import { uses12Hour } from "@/domain/time";
import {
  DeviceNotifications,
  MorningPlanReminder,
  QuietHours,
  ReminderRow,
} from "@/features/settings/reminders";
import { getUserModel } from "@/server/data/intake";
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
  const [steps, reminders, subs, model] = await Promise.all([
    listSteps(v.db, v.user.id),
    listReminders(v.db, v.user.id),
    subscriptionsFor(v.db, [v.user.id]),
    v.profile.memoryOn ? getUserModel(v.db, v.user.id) : null,
  ]);
  const publicKey = pushConfigured()
    ? (env().VAPID_PUBLIC_KEY ?? "stub")
    : null;
  const chosen = model?.model.morningPlan;
  const defaultMinute =
    chosen && chosen !== "none" ? Number(chosen.slice(0, 2)) * 60 : 8 * 60;
  const active = steps.filter((s) => s.status === "active");
  const hour12 = uses12Hour((await headers()).get("accept-language"));
  const morning = reminders.find((r) => r.kind === "morning_plan");
  return (
    <>
      <PageHeading
        eyebrow="You · Reminders"
        description="Only reminders you turn on. If a few go unanswered they pause, so they never pile up."
      >
        Reminders
      </PageHeading>
      <DeviceNotifications publicKey={publicKey} subscribed={subs.length > 0} />
      <MorningPlanReminder
        publicKey={publicKey}
        subscribed={subs.length > 0}
        reminder={morning}
        defaultMinute={defaultMinute}
        quiet={
          !!morning &&
          inQuietHours(
            morning.minuteOfDay,
            v.profile.quietStart,
            v.profile.quietEnd,
          )
        }
      />
      <section aria-labelledby="for-steps" style={{ marginTop: 32 }}>
        <h2 id="for-steps">Reminders for your day</h2>
        {active.length === 0 ? (
          <Empty>
            Nothing to remind you about yet.{" "}
            <Link href="/today">Today has what is planned</Link>.
          </Empty>
        ) : (
          <ul className="rows">
            {active.map((s) => (
              <ReminderRow
                key={s.id}
                step={{ id: s.id, title: s.title, repeatDays: s.repeatDays }}
                reminder={reminders.find(
                  (r) => r.kind === "item" && r.stepId === s.id,
                )}
                focus={focus === s.id}
                hour12={hour12}
                quiet={(() => {
                  const r = reminders.find(
                    (x) => x.kind === "item" && x.stepId === s.id,
                  );
                  return (
                    !!r &&
                    inQuietHours(
                      r.minuteOfDay,
                      v.profile.quietStart,
                      v.profile.quietEnd,
                    )
                  );
                })()}
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
        A reminder on your lock screen shows only the time, never what it is.
        Times use {v.profile.timezone}.
      </p>
    </>
  );
}
