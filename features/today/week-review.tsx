"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { AskCard } from "@/components/chat";
import type { ChatAsk } from "@/domain/chat-turn";
import { titleProblem } from "@/domain/interview-text";
import { tidyTitle } from "@/domain/week";
import { submitWeekReview } from "@/server/actions/week";
import { SafetyCheck } from "../safety/safety-check";
import { weekMeta } from "./greeting-copy";
import styles from "./today.module.css";

export type ReviewThing = {
  id: string;
  title: string;
  when: string;
  done: boolean;
  partly: number;
};
type Choice = "keep" | "change" | "let_go";
type Answer = { choice?: Choice; title: string; when: string };

const ask: ChatAsk = {
  kind: "single",
  allowOther: false,
  options: [
    { id: "keep", label: "Keep it for this week" },
    { id: "change", label: "Change it" },
    { id: "let_go", label: "Let it go" },
  ],
};

/** localStorage key: "Not now" hides the review for this person on this day. */
export const reviewHiddenKey = (owner: string, today: string) =>
  `koe:week-review-hidden:${owner}:${today}`;

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readHidden(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export type DueReview = {
  weekId: string;
  version: number;
  things: ReviewThing[];
};

/**
 * The rolling week review: keep, change or let go each open thing. Fixed copy,
 * no AI. Today always mounts it (null when nothing is due) so the saved line
 * stays after the page reloads its data.
 */
export function WeekReview({
  owner,
  today,
  review,
  region,
}: {
  owner: string;
  today: string;
  review: DueReview | null;
  region?: string | null;
}) {
  const router = useRouter();
  const key = reviewHiddenKey(owner, today);
  const hidden = useSyncExternalStore(
    subscribe,
    () => readHidden(key),
    () => false,
  );
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number } | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createId] = useState(() => crypto.randomUUID());
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (saved) status.current?.focus();
  }, [saved]);

  const things = review?.things ?? [];
  const open = things.filter((t) => !t.done);
  const answer = (t: ReviewThing): Answer =>
    answers[t.id] ?? { title: t.title, when: t.when };
  const update = (t: ReviewThing, next: Partial<Answer>) =>
    setAnswers((all) => ({ ...all, [t.id]: { ...answer(t), ...next } }));
  const ready = open.every((t) => answer(t).choice);
  const carries = open.some((t) => answer(t).choice !== "let_go");

  if (saved)
    return (
      <section className={styles.review} aria-label="Last week">
        <p ref={status} role="status" tabIndex={-1}>
          This week is set.
        </p>
        {saved.count < 3 && (
          <p>
            <Link href="/intake#interview">
              Add something for this week <span aria-hidden="true">→</span>
            </Link>
          </p>
        )}
      </section>
    );
  if (flagged)
    return (
      <SafetyCheck
        region={region ?? null}
        onResume={() => {
          setFlagged(false);
          router.refresh();
        }}
      />
    );
  if (hidden || !review) return null;
  const { weekId, version } = review;

  function save() {
    const errors: Record<string, string> = {};
    for (const t of open) {
      const a = answer(t);
      if (a.choice !== "change") continue;
      const title = tidyTitle(a.title, a.when);
      // Risk words are not a field error: the server shows the safety check.
      const problem = title
        ? (titleProblem(title) ?? (a.when.trim() && titleProblem(a.when)))
        : "Give it a few words.";
      if (problem) errors[t.id] = problem;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setError(null);
    startTransition(async () => {
      const result = await submitWeekReview({
        weekId,
        expectedVersion: version,
        createId,
        decisions: open.map((t) => {
          const a = answer(t);
          return a.choice === "change"
            ? { itemId: t.id, choice: a.choice, title: a.title, when: a.when }
            : { itemId: t.id, choice: a.choice! };
        }),
      });
      if (!result.ok) {
        if ("safety" in result) {
          // Words that tripped the safety check are not shown again.
          setAnswers({});
          setFlagged(true);
        } else setError(result.error);
        return;
      }
      setSaved({ count: result.week?.items.length ?? 0 });
      router.refresh();
    });
  }

  return (
    <section className={styles.review} aria-labelledby="week-review">
      <h2 id="week-review" className={styles.reviewTitle}>
        Last week
      </h2>
      <ul className={styles.reviewList}>
        {things.map((t) => {
          const meta = weekMeta(t);
          const a = answer(t);
          return (
            <li key={t.id} className={styles.reviewItem}>
              <p className={styles.weekTitle}>{t.title}</p>
              {meta && (
                <p className={styles.weekMeta}>
                  {t.done && <span aria-hidden="true">● </span>}
                  {meta}
                </p>
              )}
              {!t.done &&
                (a.choice === "change" ? (
                  <div className={styles.reviewEdit}>
                    <div className="field">
                      <label htmlFor={`review-title-${t.id}`}>What it is</label>
                      <input
                        id={`review-title-${t.id}`}
                        value={a.title}
                        maxLength={200}
                        autoComplete="off"
                        aria-invalid={!!fieldErrors[t.id]}
                        aria-describedby={
                          fieldErrors[t.id] ? `review-error-${t.id}` : undefined
                        }
                        onChange={(e) => update(t, { title: e.target.value })}
                      />
                      {fieldErrors[t.id] && (
                        <p id={`review-error-${t.id}`} className="error">
                          {fieldErrors[t.id]}
                        </p>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor={`review-when-${t.id}`}>
                        When it needs to be done
                      </label>
                      <input
                        id={`review-when-${t.id}`}
                        value={a.when}
                        maxLength={200}
                        autoComplete="off"
                        onChange={(e) => update(t, { when: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="text"
                      onClick={() => {
                        update(t, {
                          choice: undefined,
                          title: t.title,
                          when: t.when,
                        });
                        setFieldErrors((all) => {
                          const rest = { ...all };
                          delete rest[t.id];
                          return rest;
                        });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <AskCard
                    ask={ask}
                    label={t.title}
                    labelHidden
                    value={a.choice ? [a.choice] : []}
                    other=""
                    onChange={(value) =>
                      update(t, { choice: value[0] as Choice | undefined })
                    }
                    onOtherChange={() => {}}
                    disabled={pending}
                  />
                ))}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" disabled={!ready || pending} onClick={save}>
          {carries ? "Start this week" : "Close last week"}
        </button>
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={() => {
            try {
              window.localStorage.setItem(key, "1");
            } catch {
              // Private mode: the card simply stays.
            }
            listeners.forEach((listener) => listener());
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
