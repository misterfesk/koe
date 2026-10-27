import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { modeLabels, type TalkMode } from "@/domain/talk";
import { readableDay, localDay, weekStart } from "@/domain/time";
import { NoteComposer } from "@/features/journey/parts";
import styles from "@/features/talk/talk.module.css";
import stepStyles from "@/features/steps/steps.module.css";
import { getWeeklyReview } from "@/server/data/notes";
import { listConversations, purgeOldConversations } from "@/server/data/talk";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Reflect" };

const starts: TalkMode[] = ["talk", "thought", "problem", "plan"];

export default async function Page() {
  const v = await requireViewer();
  if (!v.profile.keepTranscripts) await purgeOldConversations(v.db, v.user.id);
  const [talks, week] = await Promise.all([
    listConversations(v.db, v.user.id, 8),
    getWeeklyReview(v.db, v.user.id, weekStart(v.today)),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Reflect"
        description="Talk something through, look back at your week, or see what you've done so far."
      >
        Reflect
      </PageHeading>

      <div className={stepStyles.starts}>
        <Link className={stepStyles.start} href="/reflect/talk">
          <strong>Talk it through</strong>
          <span>
            Koe listens first, then can help you find one thing to try.
          </span>
        </Link>
        <Link className={stepStyles.start} href="/reflect/week">
          <strong>Weekly look-back</strong>
          <span>
            {week
              ? "Done for this week. You can open it again."
              : "Three minutes: what happened, what helped, what next."}
          </span>
        </Link>
      </div>

      <section aria-labelledby="ways">
        <h2 id="ways">Or start with</h2>
        <div className="chips">
          {starts.slice(1).map((m) => (
            <Link key={m} className="chip" href={"/reflect/talk?mode=" + m}>
              {modeLabels[m]}
            </Link>
          ))}
        </div>
      </section>

      {talks.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent">Recent conversations</h2>
          <ul className={styles.list}>
            {talks.map((t) => (
              <li key={t.id}>
                <Link href={"/reflect/talk/" + t.id}>{t.title}</Link>
                <span className="meta">
                  {readableDay(
                    localDay(v.profile.timezone, new Date(t.updatedAt)),
                    v.today,
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!v.profile.keepTranscripts && (
            <p className="meta">
              Chat history is off, so conversations go after a day.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="journey" style={{ marginTop: 32 }}>
        <h2 id="journey">
          <Link href="/reflect/journey">
            Your journey <span aria-hidden="true">→</span>
          </Link>
        </h2>
        <p className="meta">
          Everything you&apos;ve done and noted, by day, and what you&apos;ve
          noticed helps.
        </p>
        <NoteComposer region={v.profile.region} />
      </section>
    </>
  );
}
