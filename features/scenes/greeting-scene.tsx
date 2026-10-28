"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SceneId } from "@/domain/scene";
import { setAppearance } from "@/server/actions/settings";
import { FlatScene } from "./flat";
import { InkScene } from "./ink";
import styles from "./scenes.module.css";
import { SCENE_STYLE_KEY, type SceneStyle } from "./style";

const options: { value: SceneStyle; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "ink", label: "Ink line" },
];

/** The scene behind the greeting card and the two swatches that pick its style. */
export function GreetingScene({
  scene,
  saved,
  className,
}: {
  scene: SceneId;
  saved: SceneStyle;
  className: string;
}) {
  // A choice shows at once; once the server value changes, it wins again.
  const [pick, setPick] = useState<{ base: SceneStyle; value: SceneStyle }>();
  const style = pick && pick.base === saved ? pick.value : saved;
  const [, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  // The server's choice wins on load; the cache only makes a change instant.
  useEffect(() => {
    localStorage.setItem(SCENE_STYLE_KEY, saved);
  }, [saved]);

  // Off-screen scenes stop moving.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) =>
      el.setAttribute("data-paused", String(!e.isIntersecting)),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const choose = (value: SceneStyle) => {
    setPick({ base: saved, value });
    localStorage.setItem(SCENE_STYLE_KEY, value);
    startTransition(() => setAppearance({ sceneStyle: value }));
  };
  const move = (from: number, by: number) => {
    const next = (from + by + options.length) % options.length;
    radios.current[next]?.focus();
    choose(options[next].value);
  };

  return (
    <>
      <div className={className} aria-hidden="true" data-scene-slot>
        <div className={styles.root} ref={root} data-paused="false">
          {style === "ink" ? (
            <InkScene sceneId={scene} />
          ) : (
            <FlatScene sceneId={scene} />
          )}
        </div>
      </div>
      <div
        className={styles.swatches}
        role="radiogroup"
        aria-label="Scene style"
      >
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              radios.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={style === o.value}
            aria-label={o.label}
            tabIndex={style === o.value ? 0 : -1}
            className={styles.swatch}
            onClick={() => choose(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            <span className={`${styles.chip} ${styles[o.value]}`} />
          </button>
        ))}
      </div>
    </>
  );
}
