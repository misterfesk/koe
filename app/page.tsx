import { PageHeading, ActionLink } from "@/components/ui";
import { REVIEW_ENABLED } from "@/fixtures/review";
import styles from "./landing.module.css";
export default function Page() {
  return (
    <>
      <section className={styles.hero}>
        <div>
          <PageHeading
            eyebrow="Koe · a private product review"
            description="Small steps, thoughtful reflection, and ways back to human support. Make a little space for what matters to you."
          >
            A small step.
            <br />
            At your pace.
          </PageHeading>
          <div className="actions">
            <ActionLink href="/onboarding">
              Try the fictional demo <span aria-hidden="true">→</span>
            </ActionLink>
            {REVIEW_ENABLED && (
              <ActionLink href="/review" secondary>
                Review all features
              </ActionLink>
            )}
          </div>
          <p className="meta">Adults 18+ · Fictional data · No live AI</p>
        </div>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.circle} />
          <span className={styles.line} />
          <span className={styles.dot} />
          <span className={styles.artLabel}>room to begin</span>
        </div>
      </section>
      <section
        className={styles.principles}
        aria-label="What this review explores"
      >
        <div>
          <p className="eyebrow">01 / Choose</p>
          <h2>One thing is enough.</h2>
          <p>
            A step you choose. Make it smaller, change it, or leave it for
            today.
          </p>
        </div>
        <div>
          <p className="eyebrow">02 / Notice</p>
          <h2>Your experience counts.</h2>
          <p>Reflect in your own words. No scores or expectations to meet.</p>
        </div>
        <div>
          <p className="eyebrow">03 / Connect</p>
          <h2>Keep people in the picture.</h2>
          <p>
            Prepare a message or make room for human care. You stay in control.
          </p>
        </div>
      </section>
      <p className="meta">
        This prototype cannot assess danger or provide treatment. Conversations
        and follow-ups are previews; nothing is sent, booked or delivered.
      </p>
    </>
  );
}
