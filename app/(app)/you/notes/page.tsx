import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { NoteComposer, SavedNotesList } from "@/features/journey/parts";
import { listNotes } from "@/server/data/notes";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Notes" };

export default async function Page() {
  const v = await requireViewer();
  const notes = await listNotes(v.db, v.user.id);
  return (
    <>
      <PageHeading
        eyebrow="You · Notes"
        description="Write down what's on your mind. Only you can see it."
      >
        Notes
      </PageHeading>
      <NoteComposer region={v.profile.region} />
      <SavedNotesList
        notes={notes}
        region={v.profile.region}
        timezone={v.profile.timezone}
        today={v.today}
      />
    </>
  );
}
