"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  readShelf,
  refreshShelf,
  shelfFeedback,
  undoShelf,
} from "@/server/actions/shelf";
import type { getShelf, ShelfPick } from "@/server/data/shelf";
import styles from "./shelf.module.css";

type ShelfView = Awaited<ReturnType<typeof getShelf>>;
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
  const [loading, setLoading] = useState(initial.refreshNeeded);
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
              ? r.shelf.current.length
                ? "Your picks are ready."
                : "No new picks this week. Check back later."
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

  const picks = (list: ShelfPick[], saved: boolean) => (
    <ul className={styles.picks}>
      {list.map((pick) => (
        <li
          className={`panel ${styles.pick}`}
          key={pick.id}
          id={`pick-${pick.id}`}
        >
          <p className="eyebrow">{pick.sourceName}</p>
          <h3>{pick.title}</h3>
          {pick.why && <p>{pick.why}</p>}
          <a
            href={pick.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${pick.title} (opens in a new tab)`}
          >
            Open <span aria-hidden="true">↗</span>
          </a>
          <div className="actions">
            {!saved && (
              <button
                type="button"
                disabled={pending || loading}
                onClick={() => feedback(pick, "saved")}
              >
                Save
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={pending || loading}
              onClick={() => feedback(pick, "not_for_me")}
            >
              Not for me
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <p className="meta">
        Picked from trusted health sites. Koe links out; it doesn&apos;t copy
        their pages.
      </p>
      <div ref={notice} tabIndex={-1}>
        <p role="status" aria-live="polite">
          {loading
            ? "Looking for a few good reads…"
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
      <section
        className={styles.section}
        aria-labelledby="current-picks"
        aria-busy={loading}
      >
        <h2 id="current-picks">This week&apos;s picks</h2>
        {!shelf.searchEnabled && (
          <p>Search is off for now. Your saved picks stay here.</p>
        )}
        {picks(shelf.current, false)}
        {!loading && shelf.searchEnabled && !shelf.current.length && (
          <p>
            No current picks to show. Ask for something in{" "}
            <Link href="/talk">Talk</Link>.
          </p>
        )}
      </section>
      <section className={styles.section} aria-labelledby="saved-picks">
        <h2 id="saved-picks">Saved</h2>
        {picks(shelf.saved, true)}
        {!shelf.saved.length && (
          <p>No saved picks to show. Use Save on a pick to keep it here.</p>
        )}
      </section>
    </>
  );
}
