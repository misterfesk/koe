import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { requireViewer } from "@/server/viewer";
import { getShelf } from "@/server/data/shelf";
import { Shelf } from "@/features/shelf/shelf";

export const metadata: Metadata = { title: "Shelf" };

export default async function Page() {
  const viewer = await requireViewer();
  const shelf = await getShelf(viewer);
  return (
    <>
      <PageHeading>Shelf</PageHeading>
      <Shelf key={viewer.user.id} ownerId={viewer.user.id} initial={shelf} />
    </>
  );
}
