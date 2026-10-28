import {
  expectationLabels,
  helpedLabels,
  outcomeLabels,
  isRepeating,
  type StepView,
} from "@/domain/steps";
import { readableDay } from "@/domain/time";
import styles from "../steps/steps.module.css";

export function StepHistory({
  step,
  today,
}: {
  step: StepView;
  today: string;
}) {
  if (!step.reports.length) return null;
  const titleFor = (version: number) =>
    step.versions.find((v) => v.version === version)?.title ?? step.title;
  return (
    <section aria-labelledby="history">
      <h2 id="history">What you&apos;ve tried</h2>
      <ol className={styles.history}>
        {step.reports.map((r) => (
          <li key={r.id}>
            <p className="meta">
              {readableDay(r.day, today)} · {outcomeLabels[r.outcome]}
              {r.helped ? " · " + helpedLabels[r.helped] : ""}
            </p>
            {r.version !== step.version && <h3>{titleFor(r.version)}</h3>}
            <dl>
              {r.expectation && (
                <>
                  <dt>You expected</dt>
                  <dd>
                    {expectationLabels[r.expectation]}
                    {r.helped
                      ? ". It turned out: " +
                        helpedLabels[r.helped].toLowerCase()
                      : ""}
                  </dd>
                </>
              )}
              {r.barrier && (
                <>
                  <dt>What got in the way</dt>
                  <dd>{r.barrier}</dd>
                </>
              )}
              {r.note && (
                <>
                  <dt>Note</dt>
                  <dd>{r.note}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ol>
      {isRepeating(step) || step.versions.length > 1 ? (
        <p className="meta">
          {step.versions.length > 1
            ? `Version ${step.version}. Earlier wordings are kept with their reports.`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
