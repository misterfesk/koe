"use client";
import { useState, useTransition } from "react";
import type { RiskLevel } from "@/domain/safety";
import type { Energy } from "@/domain/steps";
import { submitCheckIn } from "@/server/actions/plan";
import { SafetyCheck } from "../safety/safety-check";
import styles from "./today.module.css";

const options: [Energy, string][] = [
  ["low", "Low"],
  ["okay", "Okay"],
  ["more", "More"],
];

/**
 * Once a day. The answer changes today's plan, so the effect shows right
 * away (the banner below). After it, the card is a single line the person
 * can reopen to change their answer.
 */
export function CheckIn({
  checkIn,
  region,
}: {
  checkIn: { energy: Energy; word: string | null } | null;
  region: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [energy, setEnergy] = useState<Energy | null>(checkIn?.energy ?? null);
  const [word, setWord] = useState(checkIn?.word ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fits, setFits] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");

  const submit = () => {
    if (!energy) return setError("Pick how you are arriving.");
    setError("");
    startTransition(async () => {
      const r = await submitCheckIn({ energy, word });
      if (!r.ok) return setError(Object.values(r.errors)[0]);
      setSafety(r.safety ?? "none");
      // A change shows in the banner; no change is said here.
      setFits(r.changed ? "" : r.note);
      setEditing(false);
    });
  };

  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;

  if (checkIn && !editing)
    return (
      <div className={styles.arrived}>
        <p>
          <strong>
            Arrived: {checkIn.energy}
            {checkIn.word ? ` · ${checkIn.word}` : ""}
          </strong>{" "}
          <button
            type="button"
            className="text"
            onClick={() => {
              setEnergy(checkIn.energy);
              setWord(checkIn.word ?? "");
              setFits("");
              setEditing(true);
            }}
          >
            Change
          </button>
        </p>
        {fits && (
          <p className="meta" role="status">
            {fits}
          </p>
        )}
      </div>
    );

  return (
    <form
      className={styles.checkIn}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={pending}>
        <legend>How are you arriving today?</legend>
        <div className="chips">
          {options.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={energy === value}
              onClick={() => setEnergy(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="arrive-word">One word, if you like</label>
          <input
            id="arrive-word"
            value={word}
            maxLength={40}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit">Update my day</button>
          {checkIn && (
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              Keep my answer
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
