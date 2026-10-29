import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import styles from "@/features/journey/journey.module.css";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Look back" };

export default async function Page() {
  await requireViewer();
  return (
    <>
      <PageHeading eyebrow="You · Look back">Look back</PageHeading>
      <div className={`panel ${styles.comingSoonCard}`} data-look-back-parked>
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
            {/* Playful sparkles & footprint marks */}
            <g className={styles.catSparkleOne}>
              <path
                d="M32 40v14M25 47h14"
                stroke="var(--wine)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
            <g className={styles.catSparkleTwo}>
              <circle
                cx="138"
                cy="42"
                r="4.5"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="1.5"
              />
            </g>
            {/* Small subtle stepping ground marks behind the cat */}
            <ellipse cx="46" cy="116" rx="4" ry="2" fill="var(--line-strong)" />
            <ellipse
              cx="34"
              cy="116"
              rx="2.5"
              ry="1.2"
              fill="var(--line-strong)"
            />

            {/* S-curving tail lifted up in curiosity */}
            <path
              className={styles.catTail}
              d="M66 90c-14-6-20-20-14-34 3-7 11-7 11 1 0 7 4 14 12 17"
              stroke="var(--coffee)"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />

            {/* Cat walking body + turned head looking back */}
            <g className={styles.catWalkGroup}>
              {/* Back trailing leg */}
              <path
                d="M70 94l-12 20"
                stroke="var(--coffee)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse
                cx="58"
                cy="115"
                rx="5"
                ry="3"
                fill="var(--cream)"
                stroke="var(--coffee)"
                strokeWidth="1.6"
              />

              {/* Rear grounded leg */}
              <path
                d="M80 94l-4 22"
                stroke="var(--coffee)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse
                cx="76"
                cy="117"
                rx="5"
                ry="3"
                fill="var(--cream)"
                stroke="var(--coffee)"
                strokeWidth="1.6"
              />

              {/* Front trailing/grounded leg */}
              <path
                d="M100 90l-4 26"
                stroke="var(--coffee)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse
                cx="96"
                cy="117"
                rx="5"
                ry="3"
                fill="var(--cream)"
                stroke="var(--coffee)"
                strokeWidth="1.6"
              />

              {/* Front reaching leg (walking stride) */}
              <g className={styles.catFrontPaw}>
                <path
                  d="M106 88l12 24"
                  stroke="var(--coffee)"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="119"
                  cy="113"
                  rx="5.5"
                  ry="3.5"
                  fill="var(--cream)"
                  stroke="var(--coffee)"
                  strokeWidth="1.6"
                />
              </g>

              {/* Torso/body walking rightward */}
              <path
                d="M66 92c0-14 10-24 24-24h18c14 0 22 10 22 24s-10 20-24 20H88c-14 0-22-6-22-20Z"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {/* Left ear (with twitch) */}
              <path
                className={styles.catEar}
                d="M62 52L52 28l20 12"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Right ear */}
              <path
                d="M100 48l8-24-20 12"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {/* Head turned towards left/back */}
              <ellipse
                cx="80"
                cy="62"
                rx="28"
                ry="24"
                fill="var(--rose)"
                stroke="var(--coffee)"
                strokeWidth="2"
              />

              {/* Eyes looking back over shoulder */}
              <path
                d="M68 60c2-3 5-3 7 0M84 60c2-3 5-3 7 0"
                stroke="var(--coffee)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />

              {/* Nose & mouth */}
              <polygon points="76,66 73,70 79,70" fill="var(--wine)" />
              <path
                d="M76 70c-2 3-5 3-7 1.5M76 70c2 3 5 3 7 1.5"
                stroke="var(--coffee)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />

              {/* Whiskers */}
              <path
                d="M50 63h10M51 68h10M94 63h10M93 68h10"
                stroke="var(--coffee)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>
        <p className={styles.comingSoonText}>
          Reflecting on your days is coming soon.
        </p>
      </div>
    </>
  );
}
