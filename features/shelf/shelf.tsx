"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  readShelf,
  refreshShelf,
  shelfFeedback,
  undoShelf,
} from "@/server/actions/shelf";
import type { ShelfPick, ShelfView } from "@/server/data/shelf";
import { weekTopics, type WeekTopic } from "@/domain/resources";
import { PickCard } from "./pick-card";
import styles from "./shelf.module.css";

const topicLabels: Record<WeekTopic, string> = {
  work: "Work",
  study: "Study",
  home: "Home",
  money: "Money",
  people: "People",
  health_admin: "Health admin",
  creative: "Creative",
};
type Filter = "all" | "video" | "read" | WeekTopic;
const POLL_MS = 3000;
const POLL_MAX = 10;
const doneMessage = (v: ShelfView) =>
  v.current.length
    ? "Your picks are ready."
    : "No new picks this week. Check back later.";
type Undo = { token: string; message: string };
function keepUndo(undoKey: string, undo: Undo | null) {
  try {
    if (undo) sessionStorage.setItem(undoKey, JSON.stringify(undo));
    else sessionStorage.removeItem(undoKey);
  } catch {
    /* Undo still works when browser storage is unavailable. */
  }
}

export function Shelf({
  initial,
  ownerId,
}: {
  initial: ShelfView;
  ownerId: string;
}) {
  const undoKey = `koe-shelf-undo:${ownerId}`;
  const [shelf, setShelf] = useState(initial);
  const [loading, setLoading] = useState(
    initial.refreshNeeded || initial.loading,
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const request = useRef<ReturnType<typeof refreshShelf> | null>(null);
  const needsRefresh = useRef(initial.refreshNeeded);
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    // Reuse the promise during React's effect replay; do not search twice.
    if (needsRefresh.current) {
      request.current ??= refreshShelf();
      request.current
        .then((r) => {
          if (!active) return;
          setShelf(r.shelf);
          setMessage(
            r.ok
              ? doneMessage(r.shelf)
              : "Search is unavailable. Check back later.",
          );
        })
        .catch(() => {
          if (active) setMessage("Search is unavailable. Check back later.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const stored = JSON.parse(sessionStorage.getItem(undoKey) ?? "null");
        if (
          typeof stored?.token === "string" &&
          typeof stored?.message === "string"
        )
          setUndo(stored);
      } catch {
        /* A missing undo record leaves the Shelf usable. */
      }
    });
    return () => {
      active = false;
    };
  }, [undoKey]);

  // Taller cards push a linked pick below the fold; scroll to it on arrival.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  // A refresh is running for this person: re-read every 3 s, ten times at most.
  const serverLoading = shelf.loading;
  useEffect(() => {
    if (!serverLoading) return;
    let active = true;
    let count = 0;
    const timer = setInterval(() => {
      count++;
      readShelf()
        .then((v) => {
          if (!active) return;
          setShelf(v);
          if (!v.loading) {
            setLoading(false);
            setMessage(doneMessage(v));
          }
        })
        .catch(() => {});
      if (count >= POLL_MAX) {
        clearInterval(timer);
        setLoading(false);
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverLoading]);

  const feedback = (pick: ShelfPick, status: "saved" | "not_for_me") =>
    startTransition(async () => {
      setError("");
      try {
        const r = await shelfFeedback({ id: pick.id, status });
        if (!r.ok)
          return setError(
            r.error ?? "Open your Shelf again and retry your choice.",
          );
        const next = {
          token: r.undoToken!,
          message:
            status === "saved"
              ? "Saved to your Shelf."
              : "Removed from your picks.",
        };
        keepUndo(undoKey, next);
        setUndo(next);
        setShelf(await readShelf());
        requestAnimationFrame(() => notice.current?.focus());
      } catch {
        setError("Open your Shelf again to check your choice.");
      }
    });

  const restore = () =>
    startTransition(async () => {
      if (!undo) return;
      setError("");
      try {
        const r = await undoShelf(undo.token);
        if (!r.ok)
          return setError(r.error ?? "Open your Shelf again and retry Undo.");
        keepUndo(undoKey, null);
        setUndo(null);
        setShelf(await readShelf());
        setMessage("Your choice was undone.");
        requestAnimationFrame(() => notice.current?.focus());
      } catch {
        setError("Open your Shelf again to check your choice.");
      }
    });

  const list = (items: ShelfPick[], saved: boolean) => (
    <ul className={styles.row}>
      {items.map((pick) => (
        <PickCard
          key={pick.id}
          pick={pick}
          saved={saved}
          disabled={pending || loading}
          onSave={() => feedback(pick, "saved")}
          onNotForMe={() => feedback(pick, "not_for_me")}
        />
      ))}
    </ul>
  );
  const row = (id: string, heading: string, items: ShelfPick[]) =>
    items.length > 0 && (
      <section
        className={styles.section}
        aria-labelledby={`row-${id}`}
        key={id}
      >
        <h2 id={`row-${id}`}>{heading}</h2>
        {list(items, false)}
      </section>
    );

  const hasVideos = shelf.current.some((p) => p.format === "video");
  const hasReads = shelf.current.some((p) => p.format === "article");
  const topics = weekTopics.filter((t) =>
    shelf.current.some((p) => p.weekTopic === t),
  );
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...(hasVideos ? [{ key: "video" as const, label: "Videos" }] : []),
    ...(hasReads ? [{ key: "read" as const, label: "Reads" }] : []),
    ...topics.map((t) => ({ key: t as Filter, label: topicLabels[t] })),
  ];
  const active = filter;
  const shown = shelf.current.filter((p) =>
    active === "all"
      ? true
      : active === "video"
        ? p.format === "video"
        : active === "read"
          ? p.format === "article"
          : p.weekTopic === active,
  );

  return (
    <>
      <p className="meta">Picked from trusted health sites and channels.</p>
      <div ref={notice} tabIndex={-1}>
        <p role="status" aria-live="polite">
          {loading
            ? "Looking for a few good picks…"
            : (undo?.message ?? message)}
        </p>
        {undo && (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={restore}
          >
            Undo
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div aria-busy={loading}>
        {!shelf.searchEnabled && (
          <p>Search is off for now. Your saved picks stay here.</p>
        )}
        {shelf.searchEnabled && shelf.current.length >= 2 && (
          <div className={styles.chips} role="group" aria-label="Filter picks">
            {chips.map((c) => (
              <button
                type="button"
                key={c.key}
                aria-pressed={active === c.key}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {shelf.searchEnabled && shown.length > 0 && (
          <>
            {row(
              "week",
              "For your week",
              shown.filter((p) => p.forWeek),
            )}
            {row(
              "videos",
              "Videos",
              shown.filter((p) => !p.forWeek && p.format === "video"),
            )}
            {row(
              "reads",
              "Reads",
              shown.filter((p) => !p.forWeek && p.format === "article"),
            )}
          </>
        )}
        {shelf.searchEnabled && shelf.current.length > 0 && !shown.length && (
          <p>
            Nothing here yet.{" "}
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setFilter("all")}
            >
              Show all
            </button>
          </p>
        )}
        {!loading && shelf.searchEnabled && !shelf.current.length && (
          <p>
            No current picks to show. Ask for something in{" "}
            <Link href="/talk">Talk</Link>.
          </p>
        )}
      </div>
      <section className={styles.section} aria-labelledby="saved-picks">
        <h2 id="saved-picks">Saved</h2>
        {list(shelf.saved, true)}
        {!shelf.saved.length && (
          <p>No saved picks to show. Use Save on a pick to keep it here.</p>
        )}
      </section>
    </>
  );
}
