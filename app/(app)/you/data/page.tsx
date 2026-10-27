import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { DeleteEverything, Transcripts } from "@/features/settings/preferences";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Your data" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="You · Your data"
        description="It's yours: see it, take it with you, or delete it."
      >
        Your data
      </PageHeading>
      <div className="prose">
        <h2>Chat history</h2>
        <Transcripts keep={v.profile.keepTranscripts} />
        <p className="meta">
          Memory cards are managed in{" "}
          <Link href="/you/knows">What Koe knows</Link>.
        </p>
        <h2>Export</h2>
        <p>
          One file with everything: steps, reports, notes, conversations, memory
          cards, people and reminders.
        </p>
        <a className="button secondary" href="/api/export" download>
          Download my data (JSON)
        </a>
        <h2>Delete</h2>
        <DeleteEverything guest={v.isGuest} />
        <p className="meta">
          How Koe handles your data is explained in{" "}
          <Link href="/privacy">Privacy</Link>.
        </p>
      </div>
    </>
  );
}
