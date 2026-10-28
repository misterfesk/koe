import Link from "next/link";
import type { ShelfPick } from "@/server/data/shelf";
import styles from "./shelf.module.css";

export function TodayPick({ pick }: { pick: ShelfPick }) {
  return (
    <aside className={`panel ${styles.compact}`} aria-label="From your Shelf">
      <p className="eyebrow">From your Shelf · {pick.sourceName}</p>
      <h2>{pick.title}</h2>
      {pick.why && <p className="meta">{pick.why}</p>}
      <Link href={`/shelf#pick-${pick.id}`}>
        See this pick <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
