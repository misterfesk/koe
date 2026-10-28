import Link from "next/link";
import type { ShelfPick } from "@/server/data/shelf";
import styles from "./shelf.module.css";

/** Up to three picks in a row, under a Shelf heading. No picks, no section. */
export function TodayPick({ picks }: { picks: ShelfPick[] }) {
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="today-shelf">
      <div className={styles.todayHead}>
        <h2 id="today-shelf" className={styles.todayTitle}>
          Shelf
        </h2>
        <Link href="/shelf">
          View all <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className={styles.todayRow}>
        {picks.map((pick) => (
          <li key={pick.id} className={`panel ${styles.compact}`}>
            <p className="eyebrow">{pick.sourceName}</p>
            <p className={styles.todayPickTitle}>{pick.title}</p>
            {pick.why && <p className="meta">{pick.why}</p>}
            <Link href={`/shelf#pick-${pick.id}`}>
              See this pick <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
