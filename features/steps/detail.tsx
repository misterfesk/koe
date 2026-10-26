"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Select,
  ActionLink,
  Notice,
  ConfirmDelete,
  focusFirstInvalid,
} from "@/components/ui";
import { makeSmaller, currentReport, type Outcome } from "@/domain/state";
import { tone } from "@/domain/tone";
import styles from "./steps.module.css";
export function StepDetail({ id }: { id: string }) {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const p = state.steps.find((p) => p.id === id);
  const [outcome, setOutcome] = useDraft(
    id + ".v" + (p?.version ?? 0) + ".outcome",
    "",
  );
  const [barrier, setBarrier] = useDraft(id + ".barrier");
  const [experience, setExperience] = useDraft(id + ".experience");
  const [adjust, setAdjust] = useDraft(
    id + ".adjust",
    p ? makeSmaller(p.title) : "",
  );
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  if (!p)
    return (
      <>
        <PageHeading
          eyebrow="Steps"
          description="It was deleted, or it belonged to an earlier session."
        >
          This step no longer exists.
        </PageHeading>
        <ActionLink href="/steps">Back to Steps</ActionLink>
      </>
    );
  const latest = currentReport(p);
  const reported = !!latest;
  const voice = tone(
    state.appearance.tone,
    latest ? (latest.outcome === "Done" ? "done" : "setback") : "chosen",
    state.energy,
  );
  const onToday = p.id === state.activeId && !p.paused;
  function report(e: FormEvent) {
    e.preventDefault();
    if (reported) return;
    if (
      !["Done", "Partly", "Not this time", "Prefer not to say"].includes(
        outcome,
      )
    ) {
      setReportError("Choose how it went, or leave without saying.");
      focusFirstInvalid(e);
      return;
    }
    setReportError("");
    dispatch({
      type: "report",
      id,
      outcome: outcome as Outcome,
      barrier: barrier.trim(),
      experience: experience.trim(),
    });
    dispatch({ type: "clearDraft", prefix: id + ".barrier" });
    dispatch({ type: "clearDraft", prefix: id + ".experience" });
    requestAnimationFrame(() =>
      document.getElementById("report-feedback")?.focus(),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow={p.area + (p.routine ? " · Routine" : "")}
        description={reported ? undefined : voice.message}
      >
        {p.title}
      </PageHeading>
      {p.paused && (
        <Notice>
          This step is paused. Its reminder preview is paused too.
        </Notice>
      )}
      {p.prediction && (
        <div className="panel">
          <p className="eyebrow">What you expected</p>
          <p>{p.prediction}</p>
        </div>
      )}
      {!reported ? (
        <form onSubmit={report} className="prose">
          <h2 className="divider">How did it go?</h2>
          <p className="hint">
            {onToday
              ? "Whenever you've tried it. Until then it stays on Today."
              : "Whenever you've tried it."}{" "}
            Only the first question needs an answer.
          </p>
          <Select
            label="How it went"
            value={outcome}
            onChange={setOutcome}
            error={reportError}
            options={[
              { value: "", label: "Choose one" },
              ...["Done", "Partly", "Not this time", "Prefer not to say"].map(
                (x) => ({ value: x, label: x }),
              ),
            ]}
          />
          <Field
            label="What got in the way?"
            value={barrier}
            onChange={setBarrier}
            maxLength={1000}
            multiline
          />
          <Field
            label={
              p.prediction
                ? "How did it compare with what you expected?"
                : "What was it like?"
            }
            value={experience}
            onChange={setExperience}
            maxLength={1000}
            multiline
            hint={
              p.prediction
                ? "In your own words. One try can't show what caused a difference."
                : undefined
            }
          />
          <button>Save how it went</button>
        </form>
      ) : (
        <Notice id="report-feedback">{voice.message}</Notice>
      )}
      {p.versions?.some(
        (v) =>
          v.version !== p.version &&
          !p.reports.some((r) => r.version === v.version),
      ) && (
        <details>
          <summary>Earlier versions you didn&apos;t report on</summary>
          <ul className="rows">
            {p.versions
              .filter(
                (v) =>
                  v.version !== p.version &&
                  !p.reports.some((r) => r.version === v.version),
              )
              .map((v) => (
                <li key={v.version}>
                  <p className="meta">Version {v.version} · not reported</p>
                  <h3>{v.title}</h3>
                  {v.prediction && <p>{v.prediction}</p>}
                </li>
              ))}
          </ul>
        </details>
      )}
      {p.reports.length > 0 && (
        <section className={styles.history} aria-label="Step history">
          <h2>What you&apos;ve tried</h2>
          {p.reports.map((r, i) => (
            <div key={i}>
              <p className="meta">
                Version {r.version} · {r.at.slice(0, 10)} · {r.outcome}
              </p>
              <h3>{r.title}</h3>
              <dl>
                {r.prediction && (
                  <>
                    <dt>What you expected</dt>
                    <dd>{r.prediction}</dd>
                  </>
                )}
                {r.experience && (
                  <>
                    <dt>What it was like</dt>
                    <dd>{r.experience}</dd>
                  </>
                )}
                {r.barrier && (
                  <>
                    <dt>What got in the way</dt>
                    <dd>{r.barrier}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </section>
      )}
      {reported && (
        <section className="panel prose">
          <h2>Change the step?</h2>
          <p>
            Write a smaller version of the same step, or start a different step.
          </p>
          {p.proposal ? (
            <>
              <p>
                New version: <strong>{p.proposal}</strong>
              </p>
              <div className="actions">
                <button
                  onClick={() => {
                    dispatch({ type: "acceptAdjustment", id });
                    dispatch({ type: "clearDraft", prefix: id + ".adjust" });
                  }}
                >
                  Use this version
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    dispatch({ type: "rejectAdjustment", id });
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>("main input")
                        ?.focus(),
                    );
                  }}
                >
                  Keep the current one
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjust.trim()) {
                  setError(
                    "Write the smaller version, or keep the step as it is.",
                  );
                  focusFirstInvalid(e);
                  return;
                }
                setError("");
                dispatch({ type: "propose", id, title: adjust });
              }}
            >
              <Field
                label="Smaller version"
                value={adjust}
                onChange={setAdjust}
                maxLength={240}
                error={error}
              />
              <div className="actions">
                <button>Preview the change</button>
                <ActionLink href="/steps/new" secondary>
                  Write a different step
                </ActionLink>
              </div>
            </form>
          )}
        </section>
      )}
      <div className="actions">
        <button
          className="secondary"
          onClick={() => {
            dispatch({
              type: "draft",
              key: "reminder.config.target",
              value: id,
            });
            router.push("/settings/reminders");
          }}
        >
          Preview a reminder
        </button>
        <button
          className="secondary"
          onClick={() => dispatch({ type: "pauseStep", id })}
        >
          {p.paused ? "Resume step" : "Pause step"}
        </button>
        <ConfirmDelete
          label="Delete step"
          question="Delete this step?"
          detail="Its history and any reminder preview go too. This can't be undone."
          onConfirm={() => dispatch({ type: "deleteStep", id })}
        />
      </div>
      {onToday ? (
        <ActionLink href="/today" secondary>
          Back to Today
        </ActionLink>
      ) : (
        <ActionLink href="/steps" secondary>
          Back to Steps
        </ActionLink>
      )}
    </>
  );
}
