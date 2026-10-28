import type { ReactNode } from "react";
import styles from "./today.module.css";

/** The top card: greeting, date, how the day stands, then the check-in. */
export function Greeting({
  greeting,
  date,
  state,
  children,
}: {
  greeting: string;
  date: string;
  state: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.greeting} aria-label="Today">
      <div className={styles.scene} aria-hidden="true" data-scene-slot />
      <div className={styles.greetingText}>
        <h1 className={styles.greetingTitle}>{greeting}</h1>
        <p className={styles.date}>{date}</p>
        <p className={styles.state}>{state}</p>
        {children}
      </div>
    </section>
  );
}
