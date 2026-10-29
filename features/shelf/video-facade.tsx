"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./shelf.module.css";

/** Only the cover image loads until the person taps play. */
export function VideoFacade({
  videoId,
  title,
  src,
}: {
  videoId: string;
  title: string;
  src: string;
}) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (playing) frame.current?.focus();
  }, [playing]);
  if (playing)
    return (
      <div className={styles.cover}>
        <iframe
          ref={frame}
          className={styles.frame}
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  return (
    <button
      type="button"
      className={`${styles.cover} ${styles.facade}`}
      aria-label={`Play ${title}`}
      onClick={() => setPlaying(true)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" />
      <svg
        className={styles.play}
        viewBox="0 0 48 48"
        width="48"
        height="48"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="24" fill="#382d29" fillOpacity="0.85" />
        <path d="M19 15l16 9-16 9z" fill="#fff5ec" />
      </svg>
    </button>
  );
}
