"use client";
import { useState, useTransition } from "react";
import { kindLabel, planKinds, type PlanKind } from "@/domain/plan-menu";
import type { RiskLevel } from "@/domain/safety";
import { addPlanItem } from "@/server/actions/plan";
import styles from "./today.module.css";

/** The person adds something of their own to today. Small on purpose. */
export function AddSomething({
  onSafety,
}: {
  onSafety: (level: RiskLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlanKind | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open)
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        Add something
      </button>
    );

  const submit = () => {
    if (!kind) return setError("Pick what kind of thing it is.");
    setError("");
    const minute = time
      ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
      : null;
    startTransition(async () => {
      const r = await addPlanItem({ kind, title, minute });
      if (!r.ok) return setError(Object.values(r.errors)[0]);
      if (r.safety && r.safety !== "none") onSafety(r.safety);
      setOpen(false);
      setKind(null);
      setTitle("");
      setTime("");
    });
  };

  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={pending}>
        <legend>Add something to today</legend>
        <div className="chips" role="group" aria-label="What kind of thing">
          {planKinds.map((k) => (
            <button
              key={k}
              type="button"
              className="chip small"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="add-title">What is it?</label>
          <input
            id="add-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-time">Time, if you have one</label>
          <input
            id="add-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit">Add to today</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
