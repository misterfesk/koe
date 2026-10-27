import type { Metadata } from "next";
import Link from "next/link";
import { ActionLink, PageHeading } from "@/components/ui";
import { modeLabels } from "@/domain/talk";
import { Conversation } from "@/features/talk/conversation";
import { DeleteConversation } from "@/features/talk/delete";
import { getConversation } from "@/server/data/talk";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Talk" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const v = await requireViewer();
  const convo = await getConversation(v.db, v.user.id, id.slice(0, 64));
  if (!convo)
    return (
      <>
        <PageHeading eyebrow="Talk" description="It may have been deleted.">
          This conversation isn&apos;t here.
        </PageHeading>
        <ActionLink href="/talk">Start a new one</ActionLink>
      </>
    );
  return (
    <>
      <PageHeading eyebrow={"Talk · " + modeLabels[convo.mode]}>
        {convo.title}
      </PageHeading>
      <Conversation
        id={convo.id}
        mode={convo.mode}
        messages={convo.messages}
        paused={convo.safetyPaused || !!v.profile.coachingPausedAt}
        region={v.profile.region}
      />
      <div className="actions">
        <Link className="button secondary" href="/talk">
          New conversation
        </Link>
        <DeleteConversation id={convo.id} />
      </div>
    </>
  );
}
