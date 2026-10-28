import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { NewEntry } from "@/features/today/new-entry";
import { requireViewer } from "@/server/viewer";
export const metadata: Metadata = { title: "Add something" };
export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading eyebrow="Today">Add something</PageHeading>
      <NewEntry region={v.profile.region} owner={v.user.id} />
    </>
  );
}
