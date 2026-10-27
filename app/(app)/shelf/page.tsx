import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Shelf" };

export default async function Page() {
  await requireViewer();
  return (
    <PageHeading
      eyebrow="Shelf"
      description="A few good things to read or watch, picked for you. Coming soon."
    >
      Shelf
    </PageHeading>
  );
}
