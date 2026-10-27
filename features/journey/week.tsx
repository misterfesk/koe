"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { RiskLevel } from "@/domain/safety";
import type { StepView } from "@/domain/steps";
import { saveWeek } from "@/server/actions/reflect";
import { changeStep } from "@/server/actions/steps";
import { SafetyCheck } from "../safety/safety-check";
import { Shrink } from "../steps/shrink";

type Decision = "keep" | "shrink" | "swap" | "pause";

const choices: [Decision, string][] = [
  ["keep", "Keep it"],
  ["shrink", "Make it smaller"],
  ["swap", "Swap for something else"],
  ["pause", "Pause it"],
];

export function WeekDecisions({
  steps,
  initialNote,
  initialDecisions,
  region,
}: {
  steps: Pick<StepView, "id" | "title">[];
  initialNote: string;
  initialDecisions: Record<string, Decision>;
  region: string | null;
}) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const [shrinking, setShrinking] = useState<string | null>(null);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();

  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;

  if (saved)
    return (
      <section className="panel" aria-live="polite">
        <h2>Saved.</h2>
        <p>That&apos;s the week. Nothing else to do here.</p>
        <div className="actions">
          {Object.values(decisions).includes("swap") && (
            <Link className="button" href="/today">
              Pick something new on Today
            </Link>
          )}
          <Link className="button secondary" href="/talk">
            Back to Talk
          </Link>
        </div>
      </section>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await saveWeek({ note, decisions });
          if (!r.ok) return setError(r.error ?? "");
          setSafety(r.safety ?? "none");
          setSaved(true);
        });
      }}
    >
      {steps.length > 0 && (
        <section aria-labelledby="next-week">
          <h2 id="next-week">For next week</h2>
          <p className="hint">
            One choice per step. Leave any you&apos;re unsure about.
          </p>
          {steps.map((s) => (
            <fieldset key={s.id} className="chips">
              <legend>{s.title}</legend>
              {choices.map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  className="chip small"
                  aria-pressed={decisions[s.id] === d}
                  onClick={() => {
                    setDecisions((all) => ({ ...all, [s.id]: d }));
                    setShrinking(d === "shrink" ? s.id : null);
                  }}
                >
                  {label}
                </button>
              ))}
              {shrinking === s.id && (
                <div style={{ width: "100%" }}>
                  <Shrink
                    stepId={s.id}
                    title={s.title}
                    onCancel={() => {
                      setShrinking(null);
                      setDecisions((all) => ({ ...all, [s.id]: "keep" }));
                    }}
                    onPick={(title) =>
                      startTransition(async () => {
                        if (!title) return;
                        const r = await changeStep(s.id, { title });
                        if (r.ok) {
                          setShrinking(null);
                          if (r.safety && r.safety !== "none")
                            setSafety(r.safety);
                        }
                      })
                    }
                  />
                </div>
              )}
            </fieldset>
          ))}
        </section>
      )}
      <div className="field">
        <label htmlFor="week-note">Anything to remember from this week?</label>
        <p className="hint" id="week-note-hint">
          Optional. One line is plenty.
        </p>
        <textarea
          id="week-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="week-note-hint"
          aria-invalid={!!error}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="actions">
        <button disabled={pending}>Save the look-back</button>
      </div>
    </form>
  );
}
