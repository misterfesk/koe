import Link from "next/link";
import { type ReactNode } from "react";
import { Mascot } from "./mascot";
import { Nav } from "./nav";
import styles from "./shell.module.css";

export type Appearance = {
  plain: boolean;
  reducedMotion: boolean;
  tone: "expressive" | "calm" | "plain";
  mascot: boolean;
};

export function Shell({
  children,
  signedIn,
  appearance,
}: {
  children: ReactNode;
  signedIn: boolean;
  appearance?: Appearance;
}) {
  return (
    <div
      className={styles.app}
      data-plain={appearance?.plain ?? false}
      data-motion={appearance?.reducedMotion ? "reduced" : "default"}
      data-tone={appearance?.tone ?? "expressive"}
      data-signed-in={signedIn}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link
          className={styles.wordmark}
          href={signedIn ? "/today" : "/"}
          aria-label="Koe home"
        >
          Koe<span aria-hidden="true">.</span>
        </Link>
        {appearance?.mascot && !appearance.plain && <Mascot />}
        <Link className={styles.help} href="/help">
          Help
        </Link>
      </header>
      <div className={signedIn ? styles.layout : styles.single}>
        {signedIn && <Nav />}
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
      <footer className={styles.footer}>
        <div>
          <Link href="/about">About Koe</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <p>Koe is an AI tool, not a person or a clinician.</p>
      </footer>
    </div>
  );
}
