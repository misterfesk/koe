"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDelete } from "@/components/ui";
import type { RiskLevel } from "@/domain/safety";
import {
  expectationLabels,
  helpedLabels,
  isRepeating,
  outcomeLabels,
  type StepView,
} from "@/domain/steps";
import { readableDay, weekdayOptions } from "@/domain/time";
import {
  changeSchedule,
  changeStep,
  removeStep,
  setStatus,
} from "@/server/actions/steps";
import { SafetyCheck } from "../safety/safety-check";
import { Shrink } from "./shrink";
import styles from "./steps.module.css";

type Panel = "none" | "smaller" | "edit" | "when";

export function StepManage({
  step,
  region,
}: {
  step: StepView;
  region: string | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("none");
  const [title, setTitle] = useState(step.title);
  const [cue, setCue] = useState(step.cue ?? "");
  const [days, setDays] = useState<number[]>(step.repeatDays ?? []);
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  const save = (change: { title: string; cue?: string }) =>
    startTransition(async () => {
      const r = await changeStep(step.id, change);
      if (!r.ok) return setError(Object.values(r.errors)[0]);
      setError("");
      setSafety(r.safety ?? "none");
      setPanel("none");
    });
  const stopped = step.status === "finished" || step.status === "archived";

  return (
    <section aria-label="Change this">
      {safety !== "none" && (
        <SafetyCheck region={region} onResume={() => setSafety("none")} />
      )}
      <div className="actions">
        <button
          type="button"
          className="secondary"
          aria-expanded={panel === "smaller"}
          onClick={() => setPanel(panel === "smaller" ? "none" : "smaller")}
        >
          Make it smaller
        </button>
        <button
          type="button"
          className="secondary"
          aria-expanded={panel === "edit"}
          onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
        >
          Change the wording
        </button>
        <button
          type="button"
          className="secondary"
          aria-expanded={panel === "when"}
          onClick={() => setPanel(panel === "when" ? "none" : "when")}
        >
          {stopped ? "Plan it again" : "Change the day"}
        </button>
      </div>

      {panel === "smaller" && (
        <Shrink
          stepId={step.id}
          title={step.title}
          error={error}
          onCancel={() => setPanel("none")}
          onPick={(smaller) => save({ title: smaller })}
        />
      )}
      {panel === "edit" && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            save({ title, cue });
          }}
        >
          <div className="field">
            <label htmlFor="edit-title">Title</label>
            <input
              id="edit-title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!error}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-cue">When will you do it?</label>
            <input
              id="edit-cue"
              value={cue}
              maxLength={120}
              placeholder="After lunch"
              onChange={(e) => setCue(e.target.value)}
            />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="hint">
            Earlier reports keep the wording you tried then.
          </p>
          <div className="actions">
            <button disabled={pending}>Save the change</button>
          </div>
        </form>
      )}
      {panel === "when" && (
        <div className="panel">
          <div className="actions">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await changeSchedule(step.id, { when: "today" });
                  setPanel("none");
                })
              }
            >
              Today
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await changeSchedule(step.id, { when: "tomorrow" });
                  setPanel("none");
                })
              }
            >
              Tomorrow
            </button>
          </div>
          <fieldset className="chips">
            <legend>Or repeat on</legend>
            {weekdayOptions.map((d) => (
              <label key={d.value} className="chip small">
                <input
                  type="checkbox"
                  checked={days.includes(d.value)}
                  onChange={(e) =>
                    setDays((list) =>
                      e.target.checked
                        ? [...list, d.value]
                        : list.filter((x) => x !== d.value),
                    )
                  }
                />
                <span>{d.label}</span>
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="secondary"
            disabled={pending || days.length === 0}
            onClick={() =>
              startTransition(async () => {
                await changeSchedule(step.id, {
                  when: "repeat",
                  repeatDays: days,
                });
                setPanel("none");
              })
            }
          >
            Repeat on these days
          </button>
        </div>
      )}

      <div className="actions">
        {step.status === "active" && (
          <button
            type="button"
            className="text"
            disabled={pending}
            onClick={() => startTransition(() => setStatus(step.id, "paused"))}
          >
            Pause it
          </button>
        )}
        {step.status === "paused" && (
          <button
            type="button"
            className="text"
            disabled={pending}
            onClick={() => startTransition(() => setStatus(step.id, "active"))}
          >
            Resume it
          </button>
        )}
        {!stopped && (
          <button
            type="button"
            className="text"
            disabled={pending}
            onClick={() =>
              startTransition(() => setStatus(step.id, "archived"))
            }
          >
            Let it go
          </button>
        )}
        <ConfirmDelete
          label="Delete this"
          question="Delete this?"
          detail="Its history goes too. To keep the history, choose Let it go instead."
          onConfirm={() =>
            startTransition(async () => {
              await removeStep(step.id);
              router.push("/today");
            })
          }
        />
      </div>
    </section>
  );
}

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
