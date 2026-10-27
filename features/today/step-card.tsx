"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { RiskLevel } from "@/domain/safety";
import {
  areaLabels,
  helpedLabels,
  isRepeating,
  outcomeLabels,
  type Helped,
  type Outcome,
  type ReportView,
  type StepView,
} from "@/domain/steps";
import { describeDays } from "@/domain/time";
import {
  addHowItWentDetail,
  changeSchedule,
  changeStep,
  reportHowItWent,
  setStatus,
  takeBackReport,
} from "@/server/actions/steps";
import { SafetyCheck } from "../safety/safety-check";
import { Shrink } from "../steps/shrink";
import styles from "./today.module.css";

const taps: Outcome[] = ["done", "partly", "not"];

export function StepCard({
  step,
  report,
  region,
}: {
  step: StepView;
  report?: ReportView;
  region: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [barrier, setBarrier] = useState(report?.barrier ?? "");
  const [shrinking, setShrinking] = useState(false);
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError("");
      await fn();
    });
  const when = step.cue
    ? step.cue
    : isRepeating(step)
      ? describeDays(step.repeatDays!)
      : null;

  return (
    <li className={styles.card} data-reported={!!report}>
      <p className="eyebrow">
        {areaLabels[step.area]}
        {isRepeating(step) ? " · " + describeDays(step.repeatDays!) : ""}
      </p>
      <h3 className={styles.title}>
        <Link href={"/steps/" + step.id}>{step.title}</Link>
      </h3>
      {step.cue && <p className={styles.cue}>When: {when}</p>}

      {!report ? (
        <div className={styles.taps} role="group" aria-label="How did it go?">
          {taps.map((o) => (
            <button
              key={o}
              type="button"
              className={o === "done" ? undefined : "secondary"}
              disabled={pending}
              onClick={() => run(() => reportHowItWent(step.id, o))}
            >
              {outcomeLabels[o]}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.after}>
          <p role="status">
            <strong>{outcomeLabels[report.outcome]}</strong>
            {report.helped ? " · " + helpedLabels[report.helped] : ""}{" "}
            <button
              type="button"
              className="text"
              disabled={pending}
              onClick={() => run(() => takeBackReport(report.id))}
            >
              Undo
            </button>
          </p>

          {!report.helped && report.outcome !== "not" && (
            <fieldset className="chips" disabled={pending}>
              <legend>Did it help, even a little?</legend>
              {(Object.keys(helpedLabels) as Helped[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  className="chip"
                  onClick={() =>
                    run(() =>
                      addHowItWentDetail({ reportId: report.id, helped: h }),
                    )
                  }
                >
                  {helpedLabels[h]}
                </button>
              ))}
            </fieldset>
          )}

          {report.outcome !== "done" && !shrinking && (
            <>
              <div className="field">
                <label htmlFor={"barrier-" + step.id}>
                  What got in the way? <span className="meta">Optional</span>
                </label>
                <textarea
                  id={"barrier-" + step.id}
                  rows={2}
                  maxLength={1000}
                  value={barrier}
                  onChange={(e) => {
                    setBarrier(e.target.value);
                    setSaved("");
                  }}
                />
              </div>
              <div className="actions">
                {barrier.trim() !== (report.barrier ?? "") && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const r = await addHowItWentDetail({
                          reportId: report.id,
                          barrier,
                        });
                        if (r.ok) {
                          setSafety(r.safety ?? "none");
                          setSaved("Saved.");
                        }
                      })
                    }
                  >
                    Save note
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShrinking(true)}
                >
                  Make it smaller
                </button>
                {!isRepeating(step) && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(() => changeSchedule(step.id, { when: "tomorrow" }))
                    }
                  >
                    Try again tomorrow
                  </button>
                )}
                <button
                  type="button"
                  className="text"
                  disabled={pending}
                  onClick={() => run(() => setStatus(step.id, "archived"))}
                >
                  Let it go
                </button>
              </div>
              {saved && <p className="meta">{saved}</p>}
            </>
          )}

          {shrinking && (
            <Shrink
              stepId={step.id}
              title={step.title}
              error={error}
              onCancel={() => setShrinking(false)}
              onPick={(title) =>
                startTransition(async () => {
                  const r = await changeStep(step.id, { title });
                  if (!r.ok) return setError(Object.values(r.errors)[0]);
                  setSafety(r.safety ?? "none");
                  setShrinking(false);
                })
              }
            />
          )}
        </div>
      )}
      {safety !== "none" && (
        <SafetyCheck region={region} onResume={() => setSafety("none")} />
      )}
    </li>
  );
}
