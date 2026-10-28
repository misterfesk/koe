"use client";
import { useState } from "react";
import { Field } from "@/components/ui";
import { whenLabel, type WeekDraft } from "@/domain/week";
import styles from "./intake.module.css";

type Item = WeekDraft["items"][number];

/**
 * Reads its starting draft once and keeps removed things locally, so Undo
 * works even after every thing is removed. Parents stay mounted meanwhile.
 */
export function WeekReveal({
  draft,
  onChange,
  heading = true,
  disabled = false,
}: {
  draft: WeekDraft | undefined;
  /** Off when the page heading already says This week. */
  heading?: boolean;
  onChange: (value: WeekDraft | undefined) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(() => draft?.items ?? []);
  const [removed, setRemoved] = useState<number[]>([]);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const publish = (next: Item[], gone: number[]) => {
    setItems(next);
    setRemoved(gone);
    const kept = next.filter((_, i) => !gone.includes(i));
    onChange(kept.length ? { items: kept } : undefined);
  };
  return (
    <section
      aria-labelledby={heading ? "reveal-week" : undefined}
      aria-label={heading ? undefined : "This week"}
      className={styles.week}
    >
      {heading && <h2 id="reveal-week">This week</h2>}
      {items.length > 0 && removed.length === items.length && (
        <p className="meta">Nothing in This week yet.</p>
      )}
      {items.map((item, i) =>
        removed.includes(i) ? (
          <p className={styles.weekRemoved} key={item.proposalId ?? i}>
            Removed.{" "}
            <button
              type="button"
              className="text"
              disabled={disabled}
              onClick={() =>
                publish(
                  items,
                  removed.filter((x) => x !== i),
                )
              }
            >
              Undo
            </button>
          </p>
        ) : (
          <article
            className={styles.weekThing}
            key={item.proposalId ?? i}
            aria-label={item.captured.title}
          >
            {renaming === i ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = title.trim();
                  if (!value) return;
                  publish(
                    items.map((it, x) =>
                      x === i
                        ? { ...it, captured: { ...it.captured, title: value } }
                        : it,
                    ),
                    removed,
                  );
                  setRenaming(null);
                }}
              >
                <Field
                  label="Title"
                  value={title}
                  maxLength={60}
                  onChange={setTitle}
                />
                <div className={styles.itemActions}>
                  <button
                    type="submit"
                    className="secondary"
                    disabled={disabled || !title.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h3>{item.captured.title}</h3>
                {item.captured.when && (
                  <p className="meta">{whenLabel(item.captured.when)}</p>
                )}
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className="text"
                    disabled={disabled}
                    onClick={() => {
                      setTitle(item.captured.title);
                      setRenaming(i);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text"
                    disabled={disabled}
                    onClick={() => publish(items, [...removed, i])}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </article>
        ),
      )}
    </section>
  );
}
