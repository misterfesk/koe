import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { localDay, readableDay } from "@/domain/time";
import { talkModes } from "@/server/db/schema";
import { listConversations, purgeOldConversations } from "@/server/data/talk";
import type { TalkMode } from "@/server/data/talk";
import { Conversation } from "@/features/talk/conversation";
import styles from "@/features/talk/talk.module.css";
import { talkScreenState } from "@/server/talk-page";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Talk" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const v = await requireViewer();
  const asked = (await searchParams).mode;
  const mode: TalkMode = talkModes.includes(asked as TalkMode)
    ? (asked as TalkMode)
    : "talk";
  if (!v.profile.keepTranscripts) await purgeOldConversations(v.db, v.user.id);
  const [talks, screen] = await Promise.all([
    listConversations(v.db, v.user.id, 8),
    talkScreenState(v),
  ]);
  return (
    <>
      <PageHeading eyebrow="Talk">Talk it through</PageHeading>
      <Conversation
        id={null}
        mode={mode}
        messages={[]}
        paused={!!v.profile.coachingPausedAt}
        region={v.profile.region}
        {...screen}
      />
      {talks.length > 0 && (
        <section aria-labelledby="recent" style={{ marginTop: 32 }}>
          <h2 id="recent">Recent conversations</h2>
          <ul className={styles.list}>
            {talks.map((t) => (
              <li key={t.id}>
                <Link href={"/talk/" + t.id}>{t.title}</Link>
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
    </>
  );
}
