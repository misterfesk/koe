"use client";
import Link from "next/link";
import { useState } from "react";
import type { ShelfPick } from "@/server/data/shelf";
import { GeneratedCover } from "./generated-cover";
import { VideoFacade } from "./video-facade";
import styles from "./shelf.module.css";

function Cover({ pick }: { pick: ShelfPick }) {
  const [failed, setFailed] = useState(false);
  const { cover } = pick;
  if (cover.kind === "youtube" && cover.src && pick.videoId)
    return (
      <VideoFacade videoId={pick.videoId} title={pick.title} src={cover.src} />
    );
  if (cover.kind === "image" && cover.src && !failed)
    return (
      <div className={styles.cover}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  return (
    <GeneratedCover
      id={pick.id}
      sourceName={pick.sourceName}
      title={pick.title}
    />
  );
}

/** One pick, on Shelf (with actions) and on Today (`compact`). */
export function PickCard({
  pick,
  compact = false,
  saved = false,
  disabled = false,
  onSave,
  onNotForMe,
}: {
  pick: ShelfPick;
  compact?: boolean;
  saved?: boolean;
  disabled?: boolean;
  onSave?: () => void;
  onNotForMe?: () => void;
}) {
  const badge =
    pick.format === "video"
      ? "Video"
      : pick.readMinutes
        ? `${pick.readMinutes} min read`
        : null;
  const video = pick.format === "video" && pick.videoId;
  return (
    <li className={`panel ${styles.card}`} id={`pick-${pick.id}`}>
      <div className={styles.coverWrap}>
        <Cover pick={pick} />
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.body}>
        {compact ? (
          <p className={styles.title}>{pick.title}</p>
        ) : (
          <h3 className={styles.title}>{pick.title}</h3>
        )}
        <p className="meta">{pick.sourceName}</p>
        {pick.why && <p className="meta">{pick.why}</p>}
        {compact ? (
          <Link href={`/shelf#pick-${pick.id}`}>
            See this pick <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <>
            {video ? (
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(pick.videoId!)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch ${pick.title} on YouTube (opens in a new tab)`}
              >
                Watch on YouTube <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${pick.title} (opens in a new tab)`}
              >
                Open <span aria-hidden="true">↗</span>
              </a>
            )}
            <div className="actions">
              {!saved && (
                <button type="button" disabled={disabled} onClick={onSave}>
                  Save
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={onNotForMe}
              >
                Not for me
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}
