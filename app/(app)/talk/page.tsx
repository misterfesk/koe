import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { talkModes } from "@/server/db/schema";
import type { TalkMode } from "@/server/data/talk";
import { Conversation } from "@/features/talk/conversation";
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
  return (
    <>
      <PageHeading eyebrow="Reflect · Talk">Talk it through</PageHeading>
      <Conversation
        id={null}
        mode={mode}
        messages={[]}
        paused={!!v.profile.coachingPausedAt}
        region={v.profile.region}
      />
    </>
  );
}
