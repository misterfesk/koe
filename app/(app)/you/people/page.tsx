import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import styles from "@/features/connect/connect.module.css";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "People in your corner" };

export default async function Page() {
  await requireViewer();
  return (
    <>
      <PageHeading eyebrow="You · People">People in your corner</PageHeading>
      <div className={`panel ${styles.comingSoonCard}`} data-people-parked>
        <div className={styles.catAvatarWrap} aria-hidden="true">
          <svg
            className={styles.catSvg}
            viewBox="0 0 168 148"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Soft background cushion circle */}
            <circle
              cx="84"
              cy="82"
              r="54"
              fill="var(--canvas)"
              stroke="var(--line)"
              strokeWidth="1.5"
            />
            {/* Subtle motion sparkles */}
            <g className={styles.catSparkleOne}>
              <path
                d="M34 34v16M26 42h16"
                stroke="var(--wine)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
            <g className={styles.catSparkleTwo}>
              <circle
                cx="136"
                cy="38"
                r="5"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="1.5"
              />
            </g>
            {/* Swaying tail */}
            <path
              className={styles.catTail}
              d="M114 106c18-2 28-16 24-28-3-8-11-7-13 1-2 9-6 16-15 19"
              stroke="var(--coffee)"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            {/* Playful cat body + head */}
            <g className={styles.catBodyGroup}>
              {/* Body */}
              <path
                d="M54 114c0-22 12-36 30-36s30 14 30 36H54Z"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Left ear (with subtle twitch) */}
              <path
                className={styles.catEarLeft}
                d="M58 54L52 28l22 12"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Right ear */}
              <path
                d="M110 54l6-26-22 12"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Head */}
              <ellipse
                cx="84"
                cy="62"
                rx="30"
                ry="25"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
              />
              {/* Eyes */}
              <path
                d="M70 59c2-3 6-3 8 0M90 59c2-3 6-3 8 0"
                stroke="var(--coffee)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              {/* Nose & whiskers */}
              <polygon points="84,65 81,69 87,69" fill="var(--wine)" />
              <path
                d="M84 69c-2 4-6 5-9 3M84 69c2 4 6 5 9 3"
                stroke="var(--coffee)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M48 63h12M49 69h11M108 63h12M108 69h11"
                stroke="var(--coffee)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Waving paw holding a tiny message card */}
              <g className={styles.catPaw}>
                <rect
                  x="36"
                  y="78"
                  width="24"
                  height="17"
                  rx="3"
                  fill="var(--cream)"
                  stroke="var(--coffee)"
                  strokeWidth="1.6"
                />
                <path
                  d="M39 81l9 7 9-7"
                  stroke="var(--wine)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <ellipse
                  cx="56"
                  cy="95"
                  rx="7"
                  ry="5.5"
                  fill="var(--cream)"
                  stroke="var(--coffee)"
                  strokeWidth="1.8"
                />
              </g>
            </g>
          </svg>
        </div>
        <p className={styles.comingSoonText}>
          Connecting helpful people, coming soon.
        </p>
      </div>
    </>
  );
}
