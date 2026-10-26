"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { useSession } from "./session";
import styles from "./shell.module.css";
import { Mascot } from "./mascot";
const nav = [
  ["/today", "Today"],
  ["/steps", "Steps"],
  ["/reflect", "Reflect"],
  ["/connect", "Connect"],
  ["/settings", "Settings"],
];
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { state } = useSession();
  return (
    <div
      className={styles.app}
      data-plain={state.appearance.plain}
      data-motion={state.appearance.reducedMotion ? "reduced" : "default"}
      data-tone={state.appearance.tone}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/today" aria-label="Koe home">
          Koe<span aria-hidden="true">.</span>
        </Link>
        <Mascot />
        <span className={styles.label}>PRIVATE REVIEW · FICTIONAL DATA</span>
        <Link className={styles.help} href="/help">
          Help & support
        </Link>
      </header>
      <div className={styles.layout}>
        <nav aria-label="Main navigation" className={styles.nav}>
          {nav.map(([href, label], i) => (
            <Link
              aria-current={
                path === href || path.startsWith(href + "/")
                  ? "page"
                  : undefined
              }
              href={href}
              key={href}
            >
              <span aria-hidden="true" className={styles.index}>
                0{i + 1}
              </span>
              {label}
            </Link>
          ))}
          {process.env.NEXT_PUBLIC_REVIEW_TOOLS !== "false" && (
            <Link className={styles.explorer} href="/review">
              Review explorer
            </Link>
          )}
        </nav>
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
      <footer className={styles.footer}>
        <div>
          <Link href="/about">About this build</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
