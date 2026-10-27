"use client";
import Link from "next/link";
import { useState } from "react";
import type { Suggestion } from "@/domain/activities";
import { areaLabels } from "@/domain/steps";
import { PlanForm } from "../steps/plan-form";
import { Shrink } from "../steps/shrink";
import styles from "./today.module.css";

export function SuggestionCard({
  suggestions,
  region,
  heading,
}: {
  suggestions: Suggestion[];
  region: string | null;
  heading: string;
}) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<"offer" | "smaller" | "plan" | "hidden">(
    "offer",
  );
  const [title, setTitle] = useState<string | null>(null);
  // Held while the person is working on it, so a refresh of the list (for
  // example after an energy check-in) can't swap it out from under them.
  const [held, setHeld] = useState<Suggestion | null>(null);
  if (!suggestions.length && !held) return null;
  const s = held ?? suggestions[index % suggestions.length];
  const shownTitle = title ?? s.title;
  const release = () => {
    setHeld(null);
    setTitle(null);
  };

  if (stage === "hidden")
    return (
      <section className={styles.quiet}>
        <p>No step today is fine. Nothing piles up.</p>
        <button
          type="button"
          className="secondary"
          onClick={() => setStage("offer")}
        >
          Show the suggestion again
        </button>
      </section>
    );

  return (
    <section className="dark-panel" aria-labelledby="suggestion-heading">
      <p className="eyebrow" id="suggestion-heading">
        {heading} · {areaLabels[s.area]}
      </p>
      <h2 className={styles.suggestion}>{shownTitle}</h2>
      <p className={styles.because}>{s.because}</p>

      {stage === "offer" && (
        <>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setHeld(s);
                setStage("plan");
              }}
            >
              Choose this step <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className={styles.alternatives}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setHeld(s);
                setStage("smaller");
              }}
            >
              Make it smaller
            </button>
            {suggestions.length > 1 && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setIndex((i) => i + 1);
                  release();
                }}
              >
                Show another
              </button>
            )}
            <Link className="button secondary" href="/steps/new">
              Write my own
            </Link>
            <button
              type="button"
              className="text"
              onClick={() => setStage("hidden")}
            >
              Not today
            </button>
          </div>
        </>
      )}
      {stage === "smaller" && (
        <Shrink
          title={shownTitle}
          pickLabel="Use this one"
          onCancel={() => {
            release();
            setStage("offer");
          }}
          onPick={(smaller) => {
            if (smaller) setTitle(smaller);
            setStage("offer");
          }}
        />
      )}
      {stage === "plan" && (
        <div className={styles.planInPanel}>
          <PlanForm
            region={region}
            initial={{
              area: s.area,
              title: shownTitle,
              cue: s.cue,
              sourceMemoryId: s.sourceMemoryId,
            }}
            editTitle
            onCancel={() => setStage("offer")}
            onDone={() => {
              setStage("offer");
              release();
            }}
          />
        </div>
      )}
    </section>
  );
}
