"use client";
import { useState, useTransition } from "react";
import { undoPlanChange } from "@/server/actions/plan";
import type { Banner } from "./model";
import styles from "./today.module.css";

/** What the last change did to today, and a way to take it back. */
export function ChangeBanner({ banner }: { banner: Banner }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <section
      className={styles.banner}
      aria-label="What changed"
      aria-live="polite"
    >
      <p className={styles.bannerNote}>{banner.note}</p>
      {banner.lines.length > 0 && (
        <ul className={styles.bannerLines}>
          {banner.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {banner.canUndo && (
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await undoPlanChange();
              if (!r.ok) setError(Object.values(r.errors)[0]);
            })
          }
        >
          Undo
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
