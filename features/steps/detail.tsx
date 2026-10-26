"use client";
import { useState, type FormEvent } from "react";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Select,
  ActionLink,
  Notice,
} from "@/components/ui";
import { makeSmaller, currentReport, type Outcome } from "@/domain/state";
import { tone } from "@/domain/tone";
import styles from "./steps.module.css";
export function StepDetail({ id }: { id: string }) {
  const { state, dispatch } = useSession();
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
          eyebrow="Step unavailable"
          description="It may have been removed or belonged to an earlier browser session."
        >
          This step no longer exists.
        </PageHeading>
        <ActionLink href="/steps">Back to Steps</ActionLink>
      </>
    );
  const latest = currentReport(p);
  const reported = !!latest;
  const context = latest
    ? latest.outcome === "Done"
      ? "done"
      : "setback"
    : "chosen";
  const voice = tone(state.appearance.tone, context, state.energy);
  function report(e: FormEvent) {
    e.preventDefault();
    if (reported) return;
    if (
      !["Done", "Partly", "Not this time", "Prefer not to say"].includes(
        outcome,
      )
    ) {
      setReportError("Choose an outcome, or leave without reporting.");
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
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
        eyebrow={p.area + " · Version " + p.version}
        description={voice.message}
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
          <p className="eyebrow">Your original prediction</p>
          <p>{p.prediction}</p>
        </div>
      )}
      {!reported ? (
        <form onSubmit={report} className="prose">
          <h2 className="divider">What was your experience?</h2>
          <Select
            label="What happened?"
            value={outcome}
            onChange={setOutcome}
            error={reportError}
            options={[
              { value: "", label: "Choose an outcome" },
              ...["Done", "Partly", "Not this time", "Prefer not to say"].map(
                (x) => ({ value: x, label: x }),
              ),
            ]}
          />
          <Field
            label="What got in the way? (optional)"
            value={barrier}
            onChange={setBarrier}
            maxLength={1000}
            multiline
          />
          <Field
            label="What was it like? (optional)"
            value={experience}
            onChange={setExperience}
            maxLength={1000}
            multiline
            hint="Compare this with your prediction in your own words. One report cannot show what caused a change."
          />
          <button>Record this experience</button>
        </form>
      ) : (
        <Notice id="report-feedback">
          {
            tone(
              state.appearance.tone,
              latest?.outcome === "Done" ? "done" : "setback",
              state.energy,
            ).message
          }
        </Notice>
      )}
      {p.reports.length > 0 && (
        <section className={styles.history} aria-label="Faithful step history">
          <h2>What you tried & reported</h2>
          {p.reports.map((r, i) => (
            <div key={i}>
              <p className="meta">
                Version {r.version} · {r.at.slice(0, 10)} · {r.outcome}
              </p>
              <h3>{r.title}</h3>
              <dl>
                {r.prediction && (
                  <>
                    <dt>Original prediction</dt>
                    <dd>{r.prediction}</dd>
                  </>
                )}
                {r.experience && (
                  <>
                    <dt>Reported experience</dt>
                    <dd>{r.experience}</dd>
                  </>
                )}
                {r.barrier && (
                  <>
                    <dt>Reported barrier</dt>
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
          <h2>A different shape, if useful.</h2>
          <p>
            Edit a smaller part of the same activity. A different activity is a
            switch, and you can choose one in the planner.
          </p>
          {p.proposal ? (
            <>
              <p>
                Proposed: <strong>{p.proposal}</strong>
              </p>
              <div className="actions">
                <button
                  onClick={() => {
                    dispatch({ type: "acceptAdjustment", id });
                    dispatch({ type: "clearDraft", prefix: id + ".adjust" });
                  }}
                >
                  Accept adjustment
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
                  Keep original
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjust.trim()) {
                  setError("Write an adjustment, or keep your original step.");
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>('[aria-invalid="true"]')
                      ?.focus(),
                  );
                  return;
                }
                setError("");
                dispatch({ type: "propose", id, title: adjust });
              }}
            >
              <Field
                label="Proposed adjustment"
                value={adjust}
                onChange={setAdjust}
                maxLength={240}
                error={error}
              />
              <div className="actions">
                <button>Preview adjustment</button>
                <ActionLink href="/steps/new" secondary>
                  Switch activity
                </ActionLink>
              </div>
            </form>
          )}
        </section>
      )}
      <div className="actions">
        <ActionLink href="/settings/reminders" secondary>
          Reminder preview
        </ActionLink>
        <button
          className="secondary"
          onClick={() => dispatch({ type: "pauseStep", id })}
        >
          {p.paused ? "Resume step" : "Pause step"}
        </button>
        <button
          className="text danger"
          onClick={() => dispatch({ type: "deleteStep", id })}
        >
          Remove step
        </button>
      </div>
      <ActionLink href="/steps" secondary>
        Back to Steps
      </ActionLink>
    </>
  );
}
