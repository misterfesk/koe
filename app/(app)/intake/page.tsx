import type { Metadata } from "next";
import { ActionLink, PageHeading } from "@/components/ui";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Get to know you" };

// Placeholder: the real questions arrive in the next slice.
export default async function Page() {
  await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="Welcome"
        description="A few quick questions so Koe can plan a day that fits you."
      >
        Let&apos;s get to know you
      </PageHeading>
      <div className="actions">
        <ActionLink href="/today" secondary>
          Skip for now
        </ActionLink>
      </div>
    </>
  );
}
