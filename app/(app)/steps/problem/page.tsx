import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { ProblemSolver } from "@/features/steps/problem";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Work through a problem" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="Steps"
        description="Four short parts: the problem, your options, the one to try first, and a plan."
      >
        Work through a problem
      </PageHeading>
      <ProblemSolver region={v.profile.region} />
    </>
  );
}
