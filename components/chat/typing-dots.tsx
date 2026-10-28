import styles from "./chat.module.css";

/** Decorative: ChatThread owns the single accessible loading announcement. */
export function TypingDots() {
  return (
    <span className={styles.dots} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
