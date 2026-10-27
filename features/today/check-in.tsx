"use client";
import { useOptimistic, useTransition } from "react";
import type { Energy } from "@/domain/steps";
import { checkIn } from "@/server/actions/steps";
import styles from "./today.module.css";

const options: [Energy, string][] = [
  ["low", "Low"],
  ["okay", "Okay"],
  ["more", "More than usual"],
];

/** Optional, one tap. It sizes today's suggestions; it is not a score. */
export function CheckIn({ energy }: { energy: Energy | null }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(energy);
  return (
    <fieldset className={styles.checkIn}>
      <legend>How&apos;s your energy today?</legend>
      <div className="chips">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={shown === value}
            onClick={() =>
              startTransition(async () => {
                const next = shown === value ? null : value;
                setShown(next);
                await checkIn(next);
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="meta">Optional. It changes how big the suggestions are.</p>
    </fieldset>
  );
}
