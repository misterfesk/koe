import type { Metadata } from "next";
import Link from "next/link";
import { ActionLink, PageHeading } from "@/components/ui";
import {
  areaLabels,
  expectationLabels,
  isDue,
  isRepeating,
  reportOn,
} from "@/domain/steps";
import { describeDays, readableDay } from "@/domain/time";
import { StepHistory, StepManage } from "@/features/steps/detail";
import styles from "@/features/steps/steps.module.css";
import { StepCard } from "@/features/today/step-card";
import todayStyles from "@/features/today/today.module.css";
import { getStep } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Step" };

const statusLine = {
  active: null,
  paused: "Paused. It won't show on Today until you resume it.",
  finished: "Done. Plan it again any time.",
  archived: "Let go. Its history is kept.",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const v = await requireViewer();
  const step = await getStep(v.db, v.user.id, id.slice(0, 64));
  if (!step)
    return (
      <>
        <PageHeading eyebrow="Steps" description="It may have been deleted.">
          This step isn&apos;t here.
        </PageHeading>
        <ActionLink href="/today">Back to Today</ActionLink>
      </>
    );
  const report = reportOn(step, v.today);
  const when = isRepeating(step)
    ? describeDays(step.repeatDays!)
    : step.plannedFor
      ? readableDay(step.plannedFor, v.today)
      : null;
  return (
    <>
      <PageHeading eyebrow={areaLabels[step.area] + (when ? " · " + when : "")}>
        {step.title}
      </PageHeading>
      <div className={styles.facts}>
        {step.cue && <span className="pill">When: {step.cue}</span>}
        {step.expectation && (
          <span className="pill">
            You expected: {expectationLabels[step.expectation].toLowerCase()}
          </span>
        )}
      </div>
      {statusLine[step.status] && (
        <p role="status">{statusLine[step.status]}</p>
      )}
      {step.problem && (
        <div className="panel">
          <p className="eyebrow">The problem it&apos;s for</p>
          <p>{step.problem}</p>
        </div>
      )}
      {(isDue(step, v.today) || report) && (
        <ul className={todayStyles.cards}>
          <StepCard step={step} report={report} region={v.profile.region} />
        </ul>
      )}
      <StepManage step={step} region={v.profile.region} />
      {step.status === "active" && (
        <p>
          <Link href={"/you/reminders?step=" + step.id + "#step-" + step.id}>
            Set a reminder for this step <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
      <StepHistory step={step} today={v.today} />
      <p>
        <Link href="/today">← Back to Today</Link>
      </p>
    </>
  );
}
