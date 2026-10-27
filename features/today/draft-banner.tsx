"use client";
import { useState, useTransition } from "react";
import { keepTodaysPlan, tooMuchToday } from "@/server/actions/plan";
import styles from "./today.module.css";

/**
 * A plan the model made for a day after the first is a draft: the person
 * keeps it, or starts simpler. "Start simpler" is the lighter-day action, so
 * the result is a new plan version with the usual undo.
 */
export function DraftBanner({ lighter }: { lighter: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <section
      className={styles.banner}
      aria-label="Today's plan is ready"
      aria-live="polite"
    >
      <p className={styles.bannerNote}>
        {lighter
          ? "Today's plan is ready, and it is already a lighter day."
          : "Today's plan is ready. Keep it, or start simpler."}
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              const r = await keepTodaysPlan();
              if (!r.ok) setError(Object.values(r.errors)[0]);
            })
          }
        >
          Keep it
        </button>
        {!lighter && (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("");
                const r = await tooMuchToday();
                setMessage(r.ok && !r.changed ? r.note : "");
              })
            }
          >
            Start simpler
          </button>
        )}
      </div>
      {message && (
        <p className="meta" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
