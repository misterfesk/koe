import styles from "./shelf.module.css";

function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** A plain cover from palette tokens when a pick has no image. */
export function GeneratedCover({
  id,
  sourceName,
  title,
}: {
  id: string;
  sourceName: string;
  title: string;
}) {
  return (
    <div
      className={`${styles.cover} ${styles.generated} ${styles[`tone${hash(id) % 4}`]}`}
      aria-hidden="true"
    >
      <span className={styles.genSource}>{sourceName}</span>
      <span className={styles.genTitle}>{title}</span>
    </div>
  );
}
