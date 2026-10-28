"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const items = [
  ["/today", "Today", "M4 12h16M12 4v16", ["/steps"]],
  ["/talk", "Talk", "M5 6h14v9H9l-4 4z", []],
  ["/shelf", "Shelf", "M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .8-3.6 13.2-3-.8", []],
  [
    "/you",
    "You",
    "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c0-4 3-6 7-6s7 2 7 6",
    [],
  ],
] as const;

export function Nav() {
  const path = usePathname();
  if (path === "/intake") return null;
  return (
    <nav aria-label="Main navigation" className={styles.nav}>
      {items.map(([href, label, icon, also]) => (
        <Link
          aria-current={
            [href, ...also].some((h) => path === h || path.startsWith(h + "/"))
              ? "page"
              : undefined
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
