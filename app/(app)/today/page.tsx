import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeading } from "@/components/ui";
import {
  diffLines,
  diffPlans,
  laterOptions,
  templateNote,
} from "@/domain/day-plan";
import { kindLabel } from "@/domain/plan-menu";
import { IGNORE_LIMIT, inQuietHours } from "@/domain/reminders";
import { detectRisk } from "@/domain/safety";
import { isDue, isRepeating, reportOn, type StepView } from "@/domain/steps";
import {
  daysBetween,
  describeDays,
  formatClock,
  localDay,
  localMinutes,
  uses12Hour,
} from "@/domain/time";
import { SafetyCheck } from "@/features/safety/safety-check";
import { ChangeBanner } from "@/features/today/change-banner";
import { CheckIn } from "@/features/today/check-in";
import { DraftBanner } from "@/features/today/draft-banner";
import type { Banner, Entry } from "@/features/today/model";
import { sceneFor, sceneIds, type SceneId } from "@/domain/scene";
import { talkStubbed } from "@/server/llm/talk-stub";
import { Greeting } from "@/features/today/greeting";
import {
  dateLine,
  greetingFor,
  stateLine,
} from "@/features/today/greeting-copy";
import { WeekStrip } from "@/features/today/week-strip";
import { Timeline } from "@/features/today/timeline";
import { WelcomeBack } from "@/features/today/welcome-back";
import { getCheckInView, previousVersion } from "@/server/data/plan";
import { listReminders, subscriptionsFor } from "@/server/data/reminders";
import { env } from "@/server/env";
import { pushConfigured } from "@/server/push";
import { listSteps } from "@/server/data/steps";
import { openToday } from "@/server/llm/planner";
import { requireViewer } from "@/server/viewer";
import { getShelf } from "@/server/data/shelf";
import { TodayPick } from "@/features/shelf/today-pick";
import { dueWeekReview, weekThingStates } from "@/server/data/week";
import { WeekReview } from "@/features/today/week-review";

export const metadata: Metadata = { title: "Today" };

/** Test builds only (the AI stub guard): ?scene= picks a scene for screenshots. */
const forcedScene = (s?: string): SceneId | undefined =>
  talkStubbed() ? sceneIds.find((id) => id === s) : undefined;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>;
}) {
  const v = await requireViewer();
  const p = v.profile;

  if (p.coachingPausedAt)
    return (
      <>
        <PageHeading eyebrow="Today">Today</PageHeading>
        <SafetyCheck region={p.region} />
        <p className="meta">Your plans are kept.</p>
      </>
    );

  // The first time today is opened, the day is planned (once, even if two
  // requests arrive together).
  const plan = await openToday(v.user.id, { db: v.db, today: v.today });
  const shelfPicks = (await getShelf(v)).current.slice(0, 3);
  const things = await weekThingStates(v.db, v.user.id, v.today);
  const due = await dueWeekReview(v.db, v.user.id, v.today);
  const [steps, checkIn, before, accept, reminders, subs] = await Promise.all([
    listSteps(v.db, v.user.id),
    getCheckInView(v.db, v.user.id, v.today),
    plan.version > 1
      ? previousVersion(v.db, v.user.id, v.today, plan.version)
      : Promise.resolve(null),
    headers(),
    listReminders(v.db, v.user.id),
    subscriptionsFor(v.db, [v.user.id]),
  ]);
  const remindersByStep = new Map(
    reminders.flatMap((r) => (r.stepId ? [[r.stepId, r] as const] : [])),
  );
  const hour12 = uses12Hour(accept.get("accept-language"));
  const clock = (m: number) => formatClock(m, hour12);

  const toEntry = (s: StepView, inPlan: boolean): Entry => {
    const r = reportOn(s, v.today);
    const minute = s.minuteOfDay;
    return {
      id: s.id,
      title: s.title,
      why: s.why,
      kind: s.kind,
      kindLabel: s.weekItemId
        ? "This week"
        : s.kind
          ? kindLabel(s.kind)
          : "Something of your own",
      size: s.size,
      time: minute === null ? null : clock(minute),
      minute,
      inPlan,
      thing: !!s.weekItemId,
      weekItemId: s.weekItemId ?? null,
      repeats: isRepeating(s) ? describeDays(s.repeatDays!) : null,
      report: r
        ? { id: r.id, outcome: r.outcome, vsExpected: r.vsExpected }
        : null,
      reminder: (() => {
        const rem = remindersByStep.get(s.id);
        return rem
          ? {
              id: rem.id,
              time: clock(rem.minuteOfDay),
              minute: rem.minuteOfDay,
              paused: rem.paused,
              backedOff: rem.paused && rem.ignoredCount >= IGNORE_LIMIT,
              quiet: inQuietHours(rem.minuteOfDay, p.quietStart, p.quietEnd),
            }
          : null;
      })(),
      later:
        inPlan && minute !== null
          ? laterOptions(minute).map((o) => ({ ...o, time: clock(o.minute) }))
          : [],
    };
  };

  const byId = new Map(steps.map((s) => [s.id, s]));
  const inPlan = new Set(plan.items.map((i) => i.stepId));
  const planned = plan.items.flatMap((i) => {
    const s = i.stepId ? byId.get(i.stepId) : undefined;
    return s && (s.status === "active" || s.status === "finished")
      ? [toEntry(s, true)]
      : [];
  });
  // Entries from before the day plan: repeating ones due today, and one-offs
  // set for today. Nothing older comes back.
  const own = steps
    .filter(
      (s) =>
        !inPlan.has(s.id) &&
        (s.status === "active" || s.status === "finished") &&
        (isRepeating(s) ? isDue(s, v.today) : s.plannedFor === v.today),
    )
    .map((s) => toEntry(s, false));
  const entries = [...planned, ...own].sort(
    (a, b) => (a.minute ?? Infinity) - (b.minute ?? Infinity),
  );

  // A plan the model made on day 2 or later is a draft until the person keeps
  // it or starts simpler. Day 1 (the intro) and rules-made plans are not.
  const isDraft = plan.version === 1 && plan.reason === "draft";
  let banner: Banner | null = null;
  if (isDraft) banner = null;
  else if (plan.version > 1 && plan.reason !== "intro" && before) {
    const diff = diffPlans(before, plan.items);
    // A reminder belongs to its item. An item that left takes it along, and
    // whatever replaced it starts without one; Undo brings both back.
    const stillThere = new Set(plan.items.map((i) => i.stepId));
    const lostReminder = before.some(
      (i) =>
        i.stepId &&
        !stillThere.has(i.stepId) &&
        remindersByStep.get(i.stepId) !== undefined,
    );
    banner = {
      note:
        plan.note ??
        templateNote(diff, { reason: plan.reason ?? "", energy: plan.energy }),
      lines: [
        ...diffLines(diff, clock),
        ...(lostReminder
          ? ["Its reminder went too. Undo brings it back."]
          : []),
      ],
      canUndo: true,
    };
  } else if (plan.note && plan.reason !== "draft_kept") {
    banner = { note: plan.note, lines: [], canUndo: false };
  }

  const waiting = entries.filter((e) => !e.report);
  const answered = entries.filter((e) => e.report);

  // The next reminder still to come today, as a quiet line (and only then).
  const nowMinute = localMinutes(p.timezone);
  const next = entries
    .filter(
      (e) =>
        !e.report &&
        e.reminder &&
        !e.reminder.paused &&
        !e.reminder.quiet &&
        e.reminder.minute > nowMinute,
    )
    .sort((a, b) => a.reminder!.minute - b.reminder!.minute)
    .map((e) => ({ time: e.reminder!.time, title: e.title }))[0];

  const away =
    p.lastSeenAt &&
    daysBetween(localDay(p.timezone, p.lastSeenAt), v.today) >= 7;
  const older = steps.filter(
    (s) =>
      s.status === "active" &&
      !s.repeatDays &&
      s.origin === null &&
      (s.plannedFor ?? "") < v.today &&
      s.reports.length === 0,
  ).length;

  return (
    <>
      <Greeting
        greeting={greetingFor(
          localMinutes(p.timezone),
          v.isGuest ? null : v.user.name,
        )}
        date={dateLine(p.timezone)}
        scene={
          forcedScene((await searchParams).scene) ??
          sceneFor(
            Math.floor(localMinutes(p.timezone) / 60),
            plan.mode === "lighter",
          )
        }
        sceneStyle={p.sceneStyle}
        state={stateLine({
          lighter: plan.mode === "lighter",
          waiting: waiting.length,
          answered: answered.length,
        })}
      >
        <CheckIn
          checkIn={
            checkIn && {
              energy: checkIn.energy,
              // A word that tripped the safety check is not shown again.
              word:
                checkIn.word && detectRisk(checkIn.word) === "none"
                  ? checkIn.word
                  : null,
            }
          }
          region={p.region}
        />
      </Greeting>
      <WeekReview
        owner={v.user.id}
        today={v.today}
        region={p.region}
        review={
          due && {
            weekId: due.week.id,
            version: due.week.version,
            things: due.things.map((t) => ({
              id: t.id,
              title: t.title,
              when: t.when,
              done: t.done,
              partly: t.partly,
            })),
          }
        }
      />
      {away && <WelcomeBack older={older} />}
      {isDraft && <DraftBanner lighter={plan.mode === "lighter"} />}
      {banner && <ChangeBanner banner={banner} />}
      <Timeline
        entries={entries}
        canAdd={plan.items.length < 5}
        region={p.region}
        push={{
          publicKey: pushConfigured()
            ? (env().VAPID_PUBLIC_KEY ?? "stub")
            : null,
          subscribed: subs.length > 0,
        }}
        after={
          <>
            <WeekStrip
              things={things.map((t) => ({
                id: t.id,
                title: t.title,
                done: t.done,
                partly: t.partly,
              }))}
            />
            <TodayPick picks={shelfPicks} />
          </>
        }
      />
      {next && (
        <p className="meta">
          Next reminder: {next.time} · {next.title}
        </p>
      )}
    </>
  );
}
