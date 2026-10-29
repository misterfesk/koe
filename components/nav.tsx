"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { closeTalk, openTalk, useTalkOpen } from "./talk-panel";
import { useDialog } from "./use-dialog";
import styles from "./shell.module.css";

const icons = {
  today: "M4 12h16M12 4v16",
  talk: "M5 6h14v9H9l-4 4z",
  shelf: "M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .8-3.6 13.2-3-.8",
  you: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c0-4 3-6 7-6s7 2 7 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5h.01",
};

const more = [
  ["/you/care", "Appointment"],
  ["/you/notes", "Notes"],
  ["/you/look-back", "Look back"],
  ["/you/reflection", "Reflection"],
  ["/you/people", "People"],
] as const;

const on = (path: string, href: string) =>
  path === href || path.startsWith(href + "/");
const inMore = (path: string) => more.some(([href]) => on(path, href));

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name]} />
    </svg>
  );
}

function Tab({
  href,
  label,
  icon,
  path,
  also = [],
  onSelect,
}: {
  href: string;
  label: string;
  icon: keyof typeof icons;
  path: string;
  also?: string[];
  onSelect?: () => void;
}) {
  const current =
    [href, ...also].some((h) => on(path, h)) &&
    !(href === "/you" && inMore(path));
  return (
    <Link
      aria-current={current ? "page" : undefined}
      href={href}
      onClick={onSelect}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}

/** Desktop: Today, Shelf, More (opens a short list), You, Help. */
function Sidebar({ path }: { path: string }) {
  const [moreOpen, setMoreOpen] = useState(inMore(path));
  return (
    <nav
      aria-label="Main navigation"
      className={`${styles.nav} ${styles.sidebar}`}
    >
      <Tab
        href="/today"
        label="Today"
        icon="today"
        path={path}
        also={["/steps"]}
      />
      <Tab href="/shelf" label="Shelf" icon="shelf" path={path} />
      <button
        type="button"
        className={styles.navButton}
        aria-expanded={moreOpen}
        aria-controls="more-list"
        data-active={inMore(path) || undefined}
        onClick={() => setMoreOpen(!moreOpen)}
      >
        <Icon name="more" />
        <span>More</span>
      </button>
      {moreOpen && (
        <ul id="more-list" className={styles.moreList}>
          {more.map(([href, label]) => (
            <li key={href}>
              <Link
                aria-current={on(path, href) ? "page" : undefined}
                href={href}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Tab href="/you" label="You" icon="you" path={path} />
      <Tab href="/help" label="Help" icon="help" path={path} />
    </nav>
  );
}

/** Phone: Today, Shelf, Talk (centre), You, More (opens a bottom sheet). */
function TabBar({ path }: { path: string }) {
  const [sheet, setSheet] = useState(false);
  const talkOpen = useTalkOpen();
  return (
    <>
      <nav
        aria-label="Main navigation"
        className={`${styles.nav} ${styles.tabs}`}
      >
        <Tab
          href="/today"
          label="Today"
          icon="today"
          path={path}
          also={["/steps"]}
          onSelect={closeTalk}
        />
        <Tab
          href="/shelf"
          label="Shelf"
          icon="shelf"
          path={path}
          onSelect={closeTalk}
        />
        <button
          type="button"
          className={styles.navButton}
          aria-haspopup="dialog"
          aria-expanded={talkOpen}
          data-active={talkOpen || on(path, "/talk") || undefined}
          onClick={() => openTalk()}
        >
          <Icon name="talk" />
          <span>Talk</span>
        </button>
        <Tab
          href="/you"
          label="You"
          icon="you"
          path={path}
          onSelect={closeTalk}
        />
        <button
          type="button"
          className={styles.navButton}
          aria-haspopup="dialog"
          aria-expanded={sheet}
          data-active={inMore(path) || undefined}
          onClick={() => setSheet(true)}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      {sheet && <MoreSheet onClose={() => setSheet(false)} />}
    </>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useDialog(ref, { trap: true, onClose });
  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="More"
      >
        {more.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={on(path, href) ? "page" : undefined}
            onClick={() => {
              closeTalk();
              onClose();
            }}
          >
            {label}
          </Link>
        ))}
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

export function Nav() {
  const path = usePathname();
  if (path === "/intake") return null;
  return (
    <>
      <Sidebar path={path} />
      <TabBar path={path} />
    </>
  );
}
