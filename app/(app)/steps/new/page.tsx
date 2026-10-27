import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { NewStep } from "@/features/steps/new-step";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Plan a step" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="Steps"
        description="Something ordinary that matters to you or that you used to enjoy. Small enough to start today."
      >
        Plan a step
      </PageHeading>
      <NewStep region={v.profile.region} />
    </>
  );
}
