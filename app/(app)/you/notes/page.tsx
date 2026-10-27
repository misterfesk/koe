import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { NoteComposer } from "@/features/journey/parts";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Notes" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="You · Notes"
        description="Write down what's on your mind. Only you can see it."
      >
        Notes
      </PageHeading>
      <NoteComposer region={v.profile.region} />
    </>
  );
}
