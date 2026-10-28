"use client";
import { ConfirmDelete, Field } from "@/components/ui";
import type { Piece, WeekDraft } from "@/domain/week";
import styles from "./intake.module.css";

export function WeekReveal({
  draft,
  onChange,
  disabled = false,
}: {
  draft: WeekDraft;
  onChange: (value: WeekDraft | undefined) => void;
  disabled?: boolean;
}) {
  const changePiece = (i: number, j: number, change: Partial<Piece>) =>
    onChange({
      items: draft.items.map((item, x) =>
        x === i
          ? {
              ...item,
              pieces: item.pieces.map((piece, y) =>
                y === j ? { ...piece, ...change } : piece,
              ),
            }
          : item,
      ),
    });
  const resize = (i: number, j: number, piece: Piece, minutes: number) =>
    changePiece(i, j, {
      minutes,
      size: minutes <= 5 ? "tiny" : minutes <= 15 ? "small" : "medium",
      title: piece.title.replace(/\b\d+\s+minutes?\b/g, `${minutes} minutes`),
      endpoint: piece.endpoint.replace(
        /\b\d+\s+minutes?\b/g,
        `${minutes} minutes`,
      ),
    });
  return (
    <section aria-labelledby="reveal-week" className={styles.week}>
      <h2 id="reveal-week">This week</h2>
      <p className="meta">Change the words and sizes before you save.</p>
      {draft.items.map((item, i) => (
        <article
          className={styles.weekThing}
          key={i}
          aria-label={item.captured.what}
        >
          <h3>{item.captured.what}</h3>
          <details>
            <summary>Change the title</summary>
            <Field
              label={`This week title ${i + 1}`}
              value={item.captured.what}
              maxLength={400}
              onChange={(what) =>
                onChange({
                  items: draft.items.map((it, x) =>
                    x === i
                      ? { ...it, captured: { ...it.captured, what } }
                      : it,
                  ),
                })
              }
            />
          </details>
          <ol className={styles.pieces}>
            {item.pieces.map((piece, j) => (
              <li key={j}>
                <h4>{piece.title}</h4>
                <p className="meta">
                  {piece.when} · {piece.minutes} minutes
                </p>
                <details>
                  <summary>Change this</summary>
                  <fieldset disabled={disabled} className={styles.pieceFields}>
                    <Field
                      label={`Piece ${i + 1}.${j + 1} title`}
                      value={piece.title}
                      maxLength={80}
                      onChange={(title) => changePiece(i, j, { title })}
                    />
                    <Field
                      label="Stop when"
                      value={piece.endpoint}
                      maxLength={240}
                      onChange={(endpoint) => changePiece(i, j, { endpoint })}
                    />
                    <Field
                      label="When"
                      value={piece.when}
                      maxLength={160}
                      onChange={(when) => changePiece(i, j, { when })}
                    />
                    <p className="meta">
                      Make the words match the size you choose.
                    </p>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className="text"
                        disabled={piece.minutes <= 2}
                        onClick={() => {
                          const minutes =
                            piece.minutes > 15 ? 10 : piece.minutes > 5 ? 5 : 2;
                          resize(i, j, piece, minutes);
                        }}
                      >
                        Too big
                      </button>
                      <button
                        type="button"
                        className="text"
                        disabled={piece.minutes >= 25}
                        onClick={() => {
                          const minutes =
                            piece.minutes < 5
                              ? 5
                              : piece.minutes < 15
                                ? 15
                                : 25;
                          resize(i, j, piece, minutes);
                        }}
                      >
                        Too small
                      </button>
                      {item.pieces.length > 1 && (
                        <ConfirmDelete
                          label="Remove this"
                          question={`Remove “${piece.title}”?`}
                          onConfirm={() =>
                            onChange({
                              items: draft.items.map((it, x) =>
                                x === i
                                  ? {
                                      ...it,
                                      pieces: it.pieces.filter(
                                        (_, y) => y !== j,
                                      ),
                                    }
                                  : it,
                              ),
                            })
                          }
                        />
                      )}
                    </div>
                  </fieldset>
                </details>
              </li>
            ))}
          </ol>
          <ConfirmDelete
            label="Remove from this week"
            question={`Remove “${item.captured.what}” and its pieces?`}
            onConfirm={() => {
              const items = draft.items.filter((_, x) => x !== i);
              onChange(items.length ? { items } : undefined);
            }}
          />
        </article>
      ))}
    </section>
  );
}
