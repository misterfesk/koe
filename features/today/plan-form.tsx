"use client";
import { useId, useState, useTransition } from "react";
import { kindLabel, planKinds, type PlanKind } from "@/domain/plan-menu";
import { addPlanItem } from "@/server/actions/plan";
import { useDraft } from "./use-draft";
import { SafetyCheck } from "../safety/safety-check";

export function PlanForm({
  initial,
  region,
  chooseKind = false,
  onDone,
  onCancel,
  draftKey,
}: {
  initial: { kind: PlanKind; title: string; problem?: string };
  region: string | null;
  chooseKind?: boolean;
  onDone: () => void;
  onCancel: () => void;
  draftKey: string;
}) {
  const id = useId();
  const [draft, setDraft, clearDraft, ready] = useDraft(draftKey, {
    kind: initial.kind,
    title: initial.title,
    time: "",
  });
  const { kind, title, time } = draft;
  const [error, setError] = useState("");
  const [safety, setSafety] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!ready)
    return (
      <p className="meta" role="status">
        Loading your draft…
      </p>
    );
  if (safety)
    return (
      <>
        <p>Your words are saved in Notes. Your plan stays as it is.</p>
        <SafetyCheck region={region} onResume={() => setSafety(false)} />
      </>
    );
  return (
    <form
      className="plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const minute = time
            ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
            : null;
          const r = await addPlanItem({
            kind,
            title,
            minute,
            problem: initial.problem,
          });
          if (!r.ok) return setError(Object.values(r.errors)[0]);
          if (r.safety && r.safety !== "none") return setSafety(true);
          if (!r.changed) return setError(r.note);
          clearDraft();
          onDone();
        });
      }}
    >
      <fieldset disabled={pending}>
        {chooseKind && (
          <div className="chips" role="group" aria-label="What kind of thing">
            {planKinds.map((k) => (
              <button
                key={k}
                type="button"
                className="chip small"
                aria-pressed={kind === k}
                onClick={() => setDraft((d) => ({ ...d, kind: k }))}
              >
                {kindLabel(k)}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor={id + "-title"}>What is it?</label>
          <input
            id={id + "-title"}
            value={title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            aria-invalid={!!error}
            aria-describedby={error ? id + "-error" : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={id + "-time"}>Time, if you have one</label>
          <input
            id={id + "-time"}
            type="time"
            value={time}
            onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
          />
        </div>
        {error && (
          <p id={id + "-error"} role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit">{pending ? "Adding…" : "Add to today"}</button>
          <button type="button" className="secondary" onClick={onCancel}>
            Back
          </button>
        </div>
      </fieldset>
    </form>
  );
}
