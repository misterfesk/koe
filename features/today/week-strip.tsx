import Link from "next/link";
import styles from "./today.module.css";
import { weekMeta } from "./greeting-copy";

export type WeekThing = {
  id: string;
  title: string;
  done: boolean;
  partly: number;
};

/** This week at a glance: each thing and what moved. Without a week, one way in. */
export function WeekStrip({ things }: { things: WeekThing[] }) {
  return (
    <section aria-labelledby="today-week">
      <h2 id="today-week" className={styles.sectionTitle}>
        This week
      </h2>
      {things.length === 0 ? (
        <p>
          <Link href="/intake#interview">
            Tell Koe one thing you&apos;re working on{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : (
        <ul className={styles.week}>
          {things.map((t) => {
            const meta = weekMeta(t);
            return (
              <li key={t.id} className={styles.weekItem}>
                <p className={styles.weekTitle}>{t.title}</p>
                {meta && (
                  <p className={styles.weekMeta}>
                    {t.done && <span aria-hidden="true">● </span>}
                    {meta}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
