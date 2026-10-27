"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const items = [
  ["/today", "Today", "M4 12h16M12 4v16"],
  ["/steps", "Steps", "M5 18l4-5 4 3 6-9"],
  ["/reflect", "Reflect", "M5 6h14v9H9l-4 4z"],
  [
    "/connect",
    "Connect",
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 2-5 5-5s5 2 5 5m-2-4c1-1 3-1 5-1 3 0 5 2 5 5",
  ],
  [
    "/settings",
    "Settings",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2",
  ],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation" className={styles.nav}>
      {items.map(([href, label, icon]) => (
        <Link
          aria-current={
            path === href || path.startsWith(href + "/") ? "page" : undefined
          }
          href={href}
          key={href}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
