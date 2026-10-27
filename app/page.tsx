import { redirect } from "next/navigation";
import { ActionLink, Notice } from "@/components/ui";
import { Welcome } from "@/features/onboarding/welcome";
import { getViewer } from "@/server/viewer";
import styles from "./landing.module.css";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer?.profile?.onboardedAt) redirect("/today");
  const deleted = (await searchParams).deleted === "1";
  return (
    <>
      {deleted && <Notice>Everything was deleted.</Notice>}
      <section className={styles.hero}>
        <div>
          <p className="eyebrow">For adults having a hard time</p>
          <h1>
            Small things.
            <br />
            At your pace.
          </h1>
          <p className="lede">
            When your mood is low, doing a little of what matters can help. Koe
            plans a gentle day around you, makes it lighter when your energy
            drops, and shows what actually helps over time.
          </p>
          <div className="actions">
            <Welcome autoOpen={!deleted}>
              Start now <span aria-hidden="true">→</span>
            </Welcome>
            <ActionLink href="/sign-in" secondary>
              I have an account
            </ActionLink>
          </div>
          <p className="meta">
            No sign-up needed to start. You can make an account later to keep
            your data on other devices.
          </p>
        </div>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.circle} />
          <span className={styles.line} />
          <span className={styles.dot} />
          <span className={styles.artLabel}>room to begin</span>
        </div>
      </section>
      <section className={styles.principles} aria-label="How Koe works">
        <div>
          <p className="eyebrow">01 / Choose</p>
          <h2>One gentle day.</h2>
          <p>
            Answer five questions. Koe plans a few ordinary things you used to
            enjoy or need to do, small enough to start. You can change any of
            them.
          </p>
        </div>
        <div>
          <p className="eyebrow">02 / Notice</p>
          <h2>See what helps.</h2>
          <p>
            Tap how it went and whether it helped. Over the weeks, your own
            record shows what tends to work for you.
          </p>
        </div>
        <div>
          <p className="eyebrow">03 / Talk</p>
          <h2>Think it through.</h2>
          <p>
            Talk with Koe when something&apos;s on your mind. It listens first,
            then can help you turn it into one thing to try.
          </p>
        </div>
      </section>
    </>
  );
}
