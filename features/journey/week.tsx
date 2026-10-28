"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { RiskLevel } from "@/domain/safety";
import type { StepView } from "@/domain/steps";
import { saveWeek } from "@/server/actions/reflect";
import { SafetyCheck } from "../safety/safety-check";

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
        <p>
          Your note and choices are saved. Today&apos;s plan stays as it is.
        </p>
        <div className="actions">
          <Link className="button" href="/today">
            Back to Today
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
            Save what you might try. Change today&apos;s plan on Today.
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
                  }}
                >
                  {label}
                </button>
              ))}
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
