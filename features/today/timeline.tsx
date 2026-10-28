"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FocusEvent,
  type ReactNode,
} from "react";
import type { RiskLevel } from "@/domain/safety";
import { sizeLabels } from "@/domain/plan-menu";
import {
  vsExpectedLabels,
  vsExpectedPhrases,
  type VsExpected,
} from "@/domain/steps";
import { notToday, rateVsExpected, tooMuchToday } from "@/server/actions/plan";
import { reportHowItWent, takeBackReport } from "@/server/actions/steps";
import { RemindControl, type PushState } from "../reminders/remind-control";
import { SafetyCheck } from "../safety/safety-check";
import { openTalk } from "@/components/talk-panel";
import { AddSomething } from "./add-something";
import type { Entry } from "./model";
import styles from "./today.module.css";

const answers = [
  ["done", "Done"],
  ["partly", "Partly"],
] as const;

function EntryCard({ entry, push }: { entry: Entry; push: PushState }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const report = entry.report;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError("");
      await fn();
    });

  const choose = (
    choice: "shrink" | "swap" | "let_go" | "later",
    minute?: number,
  ) =>
    run(async () => {
      const r = await notToday(entry.id, { choice, minute });
      if (!r.ok) return setError(Object.values(r.errors)[0]);
      if (r.changed) {
        setOpen(false);
        setMoving(false);
        setMessage("");
      } else setMessage(r.note);
    });

  return (
    <li
      id={"entry-" + entry.id}
      className={styles.card}
      style={{ scrollMarginTop: "6rem" }}
      data-reported={!!report}
    >
      <p className="eyebrow">
        {entry.time && (
          <>
            <span className="clock">{entry.time}</span>
            {" · "}
          </>
        )}
        {entry.kindLabel}
        {entry.repeats ? " · " + entry.repeats : ""}
      </p>
      <h3 className={styles.title}>
        <Link href={"#entry-" + entry.id}>{entry.title}</Link>
      </h3>
      {entry.why && <p className={styles.cue}>{entry.why}</p>}
      <div className={styles.metaRow}>
        {entry.size && <span className="pill">{sizeLabels[entry.size]}</span>}
        {!report && entry.minute !== null && (
          <RemindControl
            stepId={entry.id}
            title={entry.title}
            minute={entry.minute}
            reminder={entry.reminder}
            push={push}
          />
        )}
        {entry.minute !== null && (
          <a
            className={styles.calendarLink}
            href={"/api/calendar/item/" + entry.id}
            download
          >
            Add to calendar
          </a>
        )}
      </div>

      {!report && !open && (
        <div className={styles.taps} role="group" aria-label="How did it go?">
          {answers.map(([o, label]) => (
            <button
              key={o}
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() =>
                run(async () => void (await reportHowItWent(entry.id, o)))
              }
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() =>
              entry.inPlan
                ? setOpen(true)
                : run(async () => void (await reportHowItWent(entry.id, "not")))
            }
          >
            Not today
          </button>
        </div>
      )}
      {entry.weekItemId && !open && report?.outcome !== "done" && (
        <button
          type="button"
          className="text"
          onClick={() => openTalk({ kind: "thing", id: entry.weekItemId! })}
        >
          Stuck? Ask Koe →
        </button>
      )}

      {!report && open && (
        <div className={styles.sheet} role="group" aria-label="Not today">
          <p className={styles.sheetTitle}>That is fine. What would help?</p>
          <div className="actions">
            {/* A tiny entry can rarely get smaller, so that option comes last.
                A This week thing is never made smaller or swapped. */}
            {!entry.thing && entry.size !== "tiny" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => choose("shrink")}
              >
                Make it smaller
              </button>
            )}
            {entry.later.length > 0 && (
              <button
                type="button"
                className={entry.thing ? undefined : "secondary"}
                disabled={pending}
                aria-expanded={moving}
                onClick={() => setMoving((m) => !m)}
              >
                Move to later
              </button>
            )}
            {!entry.thing && (
              <button
                type="button"
                className={entry.size === "tiny" ? undefined : "secondary"}
                disabled={pending}
                onClick={() => choose("swap")}
              >
                Swap for something else
              </button>
            )}
            {!entry.thing && entry.size === "tiny" && (
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => choose("shrink")}
              >
                Make it smaller
              </button>
            )}
            <button
              type="button"
              className={
                entry.thing && !entry.later.length ? undefined : "secondary"
              }
              disabled={pending}
              onClick={() => choose("let_go")}
            >
              Let it go for today
            </button>
            <button
              type="button"
              className="text"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setMoving(false);
                setMessage("");
              }}
            >
              Keep it
            </button>
          </div>
          {moving && (
            <div className="chips" role="group" aria-label="Move to">
              {entry.later.map((o) => (
                <button
                  key={o.minute}
                  type="button"
                  className="chip"
                  disabled={pending}
                  onClick={() => choose("later", o.minute)}
                >
                  {o.label} · {o.time}
                </button>
              ))}
            </div>
          )}
          {pending && (
            <p className="meta" role="status">
              Working on it…
            </p>
          )}
          {message && (
            <p className="meta" role="status">
              {message}
            </p>
          )}
        </div>
      )}

      {report && (
        <div className={styles.after}>
          <p role="status">
            {report.outcome === "done" && <span aria-hidden="true">● </span>}
            <strong>
              {report.outcome === "done"
                ? "Done"
                : report.outcome === "partly"
                  ? "Partly"
                  : "Not today"}
            </strong>
            {report.vsExpected
              ? " · " + vsExpectedPhrases[report.vsExpected]
              : ""}{" "}
            <button
              type="button"
              className="text"
              disabled={pending}
              onClick={() =>
                run(async () => void (await takeBackReport(report.id)))
              }
            >
              Undo
            </button>
          </p>
          {report.outcome !== "not" && !report.vsExpected && (
            <fieldset className="chips" disabled={pending}>
              <legend>Compared with what you expected?</legend>
              {(["better", "same", "worse"] as VsExpected[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="chip"
                  onClick={() =>
                    run(async () => void (await rateVsExpected(report.id, v)))
                  }
                >
                  {vsExpectedLabels[v]}
                </button>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The day's cards in one row. Phones swipe (snap, dots, a live "Card 1 of 3");
 * desktops show them side by side and get Previous / Next only when they overflow.
 */
function CardRow({ entries, push }: { entries: Entry[]; push: PushState }) {
  const list = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const count = entries.length;

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    setOverflow(el.scrollWidth > el.clientWidth + 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    let best = 0;
    let distance = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const d = Math.abs(
        (child as HTMLElement).offsetLeft - el.offsetLeft - el.scrollLeft,
      );
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    setIndex(best);
  }, []);

  useEffect(() => {
    measure();
    const el = list.current;
    if (!el) return;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, count]);

  // A focused control brings its card into view sideways only, so a tap
  // never moves the page under the pointer.
  const revealCard = (e: FocusEvent<HTMLUListElement>) => {
    const el = list.current;
    const card = (e.target as HTMLElement).closest("li");
    if (!el || !card) return;
    const box = el.getBoundingClientRect();
    const at = card.getBoundingClientRect();
    if (at.left < box.left) el.scrollBy({ left: at.left - box.left });
    else if (at.right > box.right) el.scrollBy({ left: at.right - box.right });
  };

  const move = (direction: 1 | -1) => {
    const el = list.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({
      left: direction * (first.offsetWidth + gap),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div className={styles.row}>
      <ul
        className={styles.cards}
        ref={list}
        onScroll={measure}
        onFocus={revealCard}
      >
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} push={push} />
        ))}
      </ul>
      {count > 1 && (
        <div className={styles.phoneOnly}>
          <div className={styles.dots} aria-hidden="true">
            {entries.map((e, i) => (
              <span key={e.id} data-active={i === index} />
            ))}
          </div>
          <p className="sr-only" role="status">
            Card {index + 1} of {count}
          </p>
        </div>
      )}
      <div className={styles.arrows} hidden={!overflow}>
        <button
          type="button"
          className="secondary"
          aria-label="Previous"
          disabled={atStart}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Next"
          disabled={atEnd}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

export function Timeline({
  entries,
  canAdd,
  region,
  push,
  after,
}: {
  entries: Entry[];
  canAdd: boolean;
  region: string | null;
  push: PushState;
  /** This week and Shelf: shown between the plan and the closing row. */
  after?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const entryIds = entries.map((entry) => entry.id).join(",");
  useEffect(() => {
    let frame = 0;
    const positionEntry = () => {
      cancelAnimationFrame(frame);
      // A legacy redirect can deliver the fragment before the timeline streams
      // in. Wait until hydration and the router's own scroll work have settled.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          let id: string;
          try {
            id = decodeURIComponent(window.location.hash.slice(1));
          } catch {
            return;
          }
          if (!id.startsWith("entry-")) return;
          document.getElementById(id)?.scrollIntoView({
            block: "start",
            behavior: "instant",
          });
        });
      });
    };
    positionEntry();
    window.addEventListener("hashchange", positionEntry);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", positionEntry);
    };
  }, [entryIds, safety]);
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  const plan = (
    <section aria-labelledby="today-plan">
      <h2 id="today-plan" className={styles.sectionTitle}>
        Your day
      </h2>
      {entries.length === 0 ? (
        <p className="meta">Nothing is planned. Add something if you like.</p>
      ) : (
        <CardRow entries={entries} push={push} />
      )}
    </section>
  );
  const end = (
    <section aria-label="More for today">
      <div className={styles.dayActions}>
        {canAdd && <AddSomething onSafety={setSafety} />}
        {entries.length > 1 && (
          <button
            type="button"
            className="text"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await tooMuchToday();
                setMessage(r.ok && !r.changed ? r.note : "");
              })
            }
          >
            This is too much today
          </button>
        )}
        {entries.some((e) => e.minute !== null) && (
          <a className="button secondary" href="/api/calendar/today" download>
            Add today to your calendar
          </a>
        )}
      </div>
      {message && (
        <p className="meta" role="status">
          {message}
        </p>
      )}
    </section>
  );
  return (
    <>
      {plan}
      {after}
      {end}
    </>
  );
}
