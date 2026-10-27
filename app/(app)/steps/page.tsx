import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeading } from "@/components/ui";
import {
  areaLabels,
  isDue,
  isRepeating,
  outcomeLabels,
  type StepView,
} from "@/domain/steps";
import { describeDays, readableDay } from "@/domain/time";
import styles from "@/features/steps/steps.module.css";
import { listSteps } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Steps" };

function Row({ step, today }: { step: StepView; today: string }) {
  const last = step.reports[0];
  const when = isRepeating(step)
    ? describeDays(step.repeatDays!)
    : step.plannedFor
      ? readableDay(step.plannedFor, today)
      : null;
  return (
    <li>
      <p className="meta">
        {areaLabels[step.area]}
        {when ? " · " + when : ""}
        {step.cue ? " · " + step.cue : ""}
      </p>
      <h3>
        <Link href={"/steps/" + step.id}>
          {step.title} <span aria-hidden="true">→</span>
        </Link>
      </h3>
      {last && (
        <p className="meta">
          Last: {outcomeLabels[last.outcome]}, {readableDay(last.day, today)}
        </p>
      )}
    </li>
  );
}

export default async function Page() {
  const v = await requireViewer();
  const steps = await listSteps(v.db, v.user.id);
  const active = steps.filter((s) => s.status === "active");
  const groups: [string, StepView[]][] = [
    ["On Today", active.filter((s) => isDue(s, v.today))],
    ["Coming up", active.filter((s) => !isDue(s, v.today) && !isRepeating(s))],
    ["Repeating", active.filter((s) => !isDue(s, v.today) && isRepeating(s))],
    ["Paused", steps.filter((s) => s.status === "paused")],
  ];
  const past = steps.filter(
    (s) => s.status === "finished" || s.status === "archived",
  );
  return (
    <>
      <PageHeading
        eyebrow="Steps"
        description="Everything you've chosen, and two ways to make a new one."
      >
        Your steps
      </PageHeading>
      <div className={styles.starts}>
        <Link className={styles.start} href="/steps/new">
          <strong>Plan a step</strong>
          <span>Pick something small to do, and when you&apos;ll do it.</span>
        </Link>
        <Link className={styles.start} href="/steps/problem">
          <strong>Work through a problem</strong>
          <span>
            Something practical in the way? Break it down and choose one thing
            to try.
          </span>
        </Link>
      </div>
      {steps.length === 0 && (
        <Empty>
          No steps yet. <Link href="/today">Today</Link> has a suggestion, or
          plan your own above.
        </Empty>
      )}
      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <section key={title} aria-label={title}>
              <h2 className={styles.group}>{title}</h2>
              <ul className="rows">
                {list.map((s) => (
                  <Row key={s.id} step={s} today={v.today} />
                ))}
              </ul>
            </section>
          ),
      )}
      {past.length > 0 && (
        <details className={styles.past}>
          <summary>Done and let go ({past.length})</summary>
          <ul className="rows">
            {past.map((s) => (
              <Row key={s.id} step={s} today={v.today} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
