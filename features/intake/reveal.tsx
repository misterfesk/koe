"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field, GrowingText } from "@/components/ui";
import { AskCard } from "@/components/chat";
import { morningPlans, type MorningPlan, type Reveal } from "@/domain/intake";
import { alternativeFor, sizeLabels, type PlanItem } from "@/domain/plan-menu";
import { inQuietHours } from "@/domain/reminders";
import type { WeekDraft } from "@/domain/week";
import { introAnchor, introDay } from "@/domain/week-picker";
import { formatClock } from "@/domain/time";
import { startMyDay } from "@/server/actions/intake";
import { enableNotifications } from "../reminders/notifications";
import { SafetyCheck } from "../safety/safety-check";
import { clearDraft } from "./draft-store";
import {
  clearInterviewDraft,
  writeInterviewDraft,
  readInterviewDraft,
} from "./interview-draft";
import { WeekReveal } from "./week-reveal";
import styles from "./intake.module.css";

type Card = Omit<Reveal["memories"][number], "keep"> & { keep: boolean };

/**
 * The reveal: what Koe understood (editable), what it could remember, and
 * today's three items. Nothing is written until "Start my day".
 */
export function RevealScreen({
  reveal,
  region,
  publicKey,
  hour12,
  owner,
  interview,
  onWeekChange,
  onBackToWeek,
}: {
  reveal: Reveal;
  region: string | null;
  publicKey: string | null;
  /** Whether the person's locale writes times on a 12-hour clock. */
  hour12: boolean;
  owner?: string;
  interview?: { token: string; draft: WeekDraft };
  onWeekChange?: (draft: WeekDraft | undefined) => void;
  onBackToWeek?: () => void;
}) {
  const router = useRouter();
  const clock = (m: number) => formatClock(m, hour12);
  const [summary, setSummary] = useState(reveal.summary);
  const [cards, setCards] = useState<Card[]>(
    reveal.memories.map((m) => ({ ...m, keep: m.keep ?? true })),
  );
  const [save, setSave] = useState(
    reveal.model.names.map((n) => ({ ...n, name: n.name })),
  );
  const [items, setItems] = useState<PlanItem[]>(reveal.items);
  // Kept locally so This week stays on screen, with Undo, after every removal.
  const [weekToken, setWeekToken] = useState(interview?.token);
  const [weekDraft, setWeekDraft] = useState(interview?.draft);
  // The week can arrive after the first render: the interview's onReady sets
  // it inside a transition, while the reveal stage commits first.
  if (interview?.token && interview.token !== weekToken) {
    setWeekToken(interview.token);
    setWeekDraft(interview.draft);
  }
  const [morningOn, setMorningOn] = useState(false);
  const [morning, setMorning] = useState<MorningPlan>(
    reveal.model.morningPlan ?? "none",
  );
  const [remindError, setRemindError] = useState("");
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [flagged]);

  // Reminders start off. Turning one on asks the browser then, with the
  // reason just shown above the switch.
  const morningMinute =
    morning && morning !== "none" ? Number(morning.slice(0, 2)) * 60 : null;
  // A reminder inside quiet hours, or for a time that has passed today, would
  // never arrive. The reveal says so instead of offering it.
  const { quietStart, quietEnd } = reveal.reminderRules;
  const morningQuiet =
    morningMinute !== null && inQuietHours(morningMinute, quietStart, quietEnd);
  // With a week, day 1 is its things plus one anchor: the same rule Start my
  // day saves with, so this list is what Today will show.
  const shown =
    weekToken && weekDraft?.items.length
      ? introDay(items, weekDraft.items, reveal.model.wake)
      : items;
  const anchor = shown === items ? null : introAnchor(items);
  // Only intro items can be swapped or removed; a This week thing stays.
  const source = (it: PlanItem) =>
    shown === items
      ? items.indexOf(it)
      : anchor && it.kind === anchor.kind && it.title === anchor.title
        ? items.indexOf(anchor)
        : -1;

  const toggleMorning = (on: boolean) =>
    startTransition(async () => {
      setRemindError("");
      if (on) {
        const asked = await enableNotifications(publicKey!);
        if (!asked.ok) return setRemindError(asked.message);
      }
      setMorningOn(on);
    });

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
      try {
        const r = await startMyDay({
          model: { ...reveal.model, morningPlan: morning },
          summary,
          memories: cards
            .filter((c) => c.keep && c.text.trim())
            .map(({ kind, text }) => ({ kind, text })),
          savePeople: save.filter((n) => n.save).map((n) => n.name),
          items,
          remindItems: false,
          morningPlanMinute: morningOn ? morningMinute : null,
          ...(weekToken && weekDraft
            ? { interview: { token: weekToken, draft: weekDraft } }
            : {}),
        });
        if (!r.ok) return setError(Object.values(r.errors)[0]);
        if (r.safety && r.safety !== "none") return setFlagged(true);
        clearDraft(owner);
        if (owner) clearInterviewDraft(owner, "intro");
        router.replace("/today");
      } catch {
        setError("Your day couldn't be confirmed. Try Start my day again.");
      }
    });
  };

  if (flagged)
    return (
      <SafetyCheck
        region={region}
        onResume={() => {
          // Back to what Koe wrote, so the flagged words are not saved.
          setSummary(reveal.summary);
          setCards(
            reveal.memories.map((m) => ({ ...m, keep: m.keep ?? true })),
          );
          setFlagged(false);
        }}
      />
    );

  return (
    <>
      <header
        className={`page-heading ${weekToken ? styles.proposalHeading : ""}`}
      >
        <p className="eyebrow">Your first day</p>
        <h1 ref={heading} tabIndex={-1}>
          Here&apos;s what I understood
        </h1>
        {reveal.source === "fallback" && (
          <p className="lede">A simple start from your answers.</p>
        )}
      </header>

      {weekToken && (
        <WeekReveal
          draft={weekDraft}
          disabled={pending}
          onChange={(draft) => {
            setWeekDraft(draft);
            onWeekChange?.(draft);
            if (owner) {
              const stored = readInterviewDraft(owner, "intro");
              if (stored)
                writeInterviewDraft(owner, "intro", { ...stored, draft });
            }
          }}
        />
      )}

      <Field
        label="You can change this. It becomes what Koe knows about you."
        value={summary}
        onChange={setSummary}
        multiline
        grow
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
                  <GrowingText
                    aria-label={`Memory ${i + 1}`}
                    value={c.text}
                    maxLength={120}
                    onChange={(text) =>
                      setCards(
                        cards.map((x, j) => (j === i ? { ...x, text } : x)),
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
          {shown.map((it) => {
            const i = source(it);
            return (
              <li key={`${it.kind}-${it.title}`} className={styles.item}>
                <p className="eyebrow">{sizeLabels[it.size]}</p>
                <h3>{it.title}</h3>
                <p className="meta">{it.why}</p>
                {i >= 0 && (
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
                )}
              </li>
            );
          })}
        </ol>
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
      </section>

      {publicKey && (
        <section aria-labelledby="reveal-remind">
          <h2 id="reveal-remind" className={styles.sectionTitle}>
            Want a reminder?
          </h2>
          <p className="meta">
            A reminder shows only the time, never what it is.
          </p>
          <AskCard
            label="A morning plan time"
            ask={{
              kind: "single",
              allowOther: false,
              options: morningPlans.map((value) => ({
                id: value,
                label:
                  value === "none"
                    ? "Not now"
                    : clock(Number(value.slice(0, 2)) * 60),
              })),
            }}
            value={[morning]}
            other=""
            onOtherChange={() => {}}
            disabled={pending}
            onChange={(value) => {
              setMorning((value[0] as MorningPlan) ?? "none");
              setMorningOn(false);
            }}
          />
          {morningMinute !== null &&
            (morningQuiet ? (
              <p className="meta" role="note">
                {clock(morningMinute)} is inside your quiet hours, so a morning
                plan reminder would never arrive. Pick another time, or change
                your quiet hours, in You → Reminders once you have started.
              </p>
            ) : (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={morningOn}
                  disabled={pending}
                  onChange={(e) => toggleMorning(e.target.checked)}
                />
                <span>
                  Remind me at {clock(morningMinute)} when my day is ready
                </span>
              </label>
            ))}
          {remindError && (
            <p className="error" role="alert">
              {remindError}
            </p>
          )}
        </section>
      )}

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
      <p className="meta">
        <Link href="/today">Leave for Today</Link>
      </p>
      {onBackToWeek && (
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={onBackToWeek}
        >
          Back to this week
        </button>
      )}
      <p className="meta">Nothing is saved until you tap Start my day.</p>
    </>
  );
}
