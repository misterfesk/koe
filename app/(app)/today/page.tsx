import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { suggestions } from "@/domain/activities";
import { todayPlan, upcoming } from "@/domain/steps";
import { daysBetween, localDay } from "@/domain/time";
import { tone } from "@/domain/tone";
import { SafetyCheck } from "@/features/safety/safety-check";
import { CheckIn } from "@/features/today/check-in";
import { StepCard } from "@/features/today/step-card";
import { SuggestionCard } from "@/features/today/suggestion";
import { WelcomeBack } from "@/features/today/welcome-back";
import styles from "@/features/today/today.module.css";
import { getCheckIn } from "@/server/data/profile";
import { listSteps } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Today" };

// One small thing is the point. Past this many, Koe stops offering more.
const ENOUGH = 3;

export default async function Page() {
  const v = await requireViewer();
  const p = v.profile;
  const [steps, energy] = await Promise.all([
    listSteps(v.db, v.user.id),
    getCheckIn(v.db, v.user.id, v.today),
  ]);
  const { waiting, reported } = todayPlan(steps, v.today);
  const later = upcoming(steps, v.today);
  const away =
    p.lastSeenAt &&
    daysBetween(localDay(p.timezone, p.lastSeenAt), v.today) >= 7;
  const oldSteps = steps.filter(
    (s) =>
      s.status === "active" &&
      !s.repeatDays &&
      (s.plannedFor ?? "") < v.today &&
      s.reports.length === 0,
  ).length;

  // Everything planned for today has an answer: close the day, gently.
  const context = waiting.length
    ? "chosen"
    : reported.length
      ? reported.some((r) => r.report.outcome === "done")
        ? "enough"
        : "setback"
      : "welcome";
  const voice = tone(p.tone, context, energy);

  if (p.coachingPausedAt)
    return (
      <>
        <PageHeading eyebrow="Today">Today</PageHeading>
        <SafetyCheck region={p.region} />
        <p className="meta">
          Your steps are kept. <Link href="/steps">See your steps</Link>
        </p>
      </>
    );

  const offer = suggestions(
    steps,
    energy,
    steps.length + reported.length,
    v.today,
  );
  const planned = waiting.length + reported.length;

  return (
    <>
      <PageHeading eyebrow="Today">{voice.message}</PageHeading>
      {away && <WelcomeBack oldSteps={oldSteps} />}
      <CheckIn energy={energy} />

      {(waiting.length > 0 || reported.length > 0) && (
        <section aria-labelledby="today-steps">
          <h2 id="today-steps" className={styles.sectionTitle}>
            Your steps today
          </h2>
          <ul className={styles.cards}>
            {waiting.map((s) => (
              <StepCard key={s.id} step={s} region={p.region} />
            ))}
            {reported.map(({ step, report }) => (
              <StepCard
                key={step.id}
                step={step}
                report={report}
                region={p.region}
              />
            ))}
          </ul>
        </section>
      )}

      {waiting.length === 0 && planned < ENOUGH && (
        <SuggestionCard
          suggestions={offer}
          region={p.region}
          heading={planned ? "One more, if you like" : "A step for today"}
        />
      )}
      {waiting.length > 0 && planned < ENOUGH && (
        <details className={styles.more}>
          <summary>Add another step</summary>
          <SuggestionCard
            suggestions={offer}
            region={p.region}
            heading="Another step"
          />
        </details>
      )}

      {later.length > 0 && (
        <p className="meta">
          {later.length} more {later.length === 1 ? "step is" : "steps are"}{" "}
          planned for other days. <Link href="/steps">See your steps</Link>
        </p>
      )}

      <div className={styles.below}>
        <p className="meta">Not a step kind of day?</p>
        <Link className="button secondary" href="/reflect">
          Talk it through <span aria-hidden="true">→</span>
        </Link>
      </div>
    </>
  );
}
