"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field } from "@/components/ui";
import type { Reveal } from "@/domain/intake";
import { alternativeFor, sizeLabels, type PlanItem } from "@/domain/plan-menu";
import { formatMinutes } from "@/domain/time";
import { startMyDay } from "@/server/actions/intake";
import { SafetyCheck } from "../safety/safety-check";
import styles from "./intake.module.css";

type Card = Reveal["memories"][number] & { keep: boolean };

/**
 * The reveal: what Koe understood (editable), what it could remember, and
 * today's three items. Nothing is written until "Start my day".
 */
export function RevealScreen({
  reveal,
  region,
}: {
  reveal: Reveal;
  region: string | null;
}) {
  const [summary, setSummary] = useState(reveal.summary);
  const [cards, setCards] = useState<Card[]>(
    reveal.memories.map((m) => ({ ...m, keep: true })),
  );
  const [save, setSave] = useState(
    reveal.model.names.map((n) => ({ ...n, name: n.name })),
  );
  const [items, setItems] = useState<PlanItem[]>(reveal.items);
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [flagged]);

  const swap = (index: number) => {
    const next = alternativeFor(items[index], reveal.model);
    if (!next) return;
    setItems(items.map((it, i) => (i === index ? next : it)));
    setAnnounce(`Swapped for: ${next.title}`);
  };
  const remove = (index: number) => {
    setAnnounce(`Removed: ${items[index].title}`);
    setItems(items.filter((_, i) => i !== index));
  };

  const start = () => {
    setError("");
    startTransition(async () => {
      const r = await startMyDay({
        model: reveal.model,
        summary,
        memories: cards
          .filter((c) => c.keep && c.text.trim())
          .map(({ kind, text }) => ({ kind, text })),
        savePeople: save.filter((n) => n.save).map((n) => n.name),
        items,
      });
      // On success the server sends the person to Today.
      if (!r.ok) return setError(Object.values(r.errors)[0]);
      if (r.safety && r.safety !== "none") setFlagged(true);
    });
  };

  if (flagged)
    return (
      <SafetyCheck
        region={region}
        onResume={() => {
          // Back to what Koe wrote, so the flagged words are not saved.
          setSummary(reveal.summary);
          setCards(reveal.memories.map((m) => ({ ...m, keep: true })));
          setFlagged(false);
        }}
      />
    );

  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Your first day</p>
        <h1 ref={heading} tabIndex={-1}>
          Here&apos;s what I understood
        </h1>
        {reveal.source === "fallback" && (
          <p className="lede">
            Here&apos;s a simple start — Koe will learn more as you go.
          </p>
        )}
      </header>

      <Field
        label="You can change this. It becomes what Koe knows about you."
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={400}
      />

      {reveal.eatingConcern && (
        <div className="panel" role="note">
          <p>
            If food or eating is on your mind, it can help to tell a doctor or
            someone you trust. <Link href="/help">Help</Link> lists people you
            can reach.
          </p>
        </div>
      )}

      {cards.length > 0 && (
        <section aria-labelledby="reveal-memories">
          <h2 id="reveal-memories" className={styles.sectionTitle}>
            Things Koe could remember
          </h2>
          <p className="meta">
            Koe only remembers what you tick. You can change the words, and
            remove any of it later in You.
          </p>
          <ul className={styles.list}>
            {cards.map((c, i) => (
              <li key={i} className={styles.item}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={c.keep}
                    onChange={(e) =>
                      setCards(
                        cards.map((x, j) =>
                          j === i ? { ...x, keep: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <span>Remember this</span>
                </label>
                <div className="field">
                  <input
                    aria-label={`Memory ${i + 1}`}
                    value={c.text}
                    maxLength={120}
                    onChange={(e) =>
                      setCards(
                        cards.map((x, j) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
                <p className="meta">From your intro</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {save.length > 0 && (
        <section aria-labelledby="reveal-people">
          <h2 id="reveal-people" className={styles.sectionTitle}>
            Your people
          </h2>
          {save.map((n, i) => (
            <label key={i} className="toggle">
              <input
                type="checkbox"
                checked={n.save}
                onChange={(e) =>
                  setSave(
                    save.map((x, j) =>
                      j === i ? { ...x, save: e.target.checked } : x,
                    ),
                  )
                }
              />
              <span>Save {n.name} to my people</span>
            </label>
          ))}
        </section>
      )}

      <section aria-labelledby="reveal-plan">
        <h2 id="reveal-plan" className={styles.sectionTitle}>
          Today&apos;s plan
        </h2>
        <ol className={styles.list}>
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.title}`} className={styles.item}>
              <p className="eyebrow">
                {formatMinutes(it.minuteOfDay)} · {sizeLabels[it.size]}
              </p>
              <h3>{it.title}</h3>
              <p className="meta">{it.why}</p>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className="text"
                  onClick={() => swap(i)}
                  aria-label={`Swap: ${it.title}`}
                >
                  Swap
                </button>
                <button
                  type="button"
                  className="text danger"
                  disabled={items.length <= 1}
                  onClick={() => remove(i)}
                  aria-label={`Remove: ${it.title}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={pending || !items.length}
          onClick={start}
        >
          {pending ? "Starting…" : "Start my day"}
        </button>
      </div>
      <p className="meta">Nothing is saved until you tap Start my day.</p>
    </>
  );
}
