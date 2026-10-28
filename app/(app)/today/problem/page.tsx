import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { ProblemSolver } from "@/features/today/problem";
import { requireViewer } from "@/server/viewer";
export const metadata: Metadata = { title: "Work through a problem" };
export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="Today"
        description="Name one problem, consider your options, then choose something to try."
      >
        Work through a problem
      </PageHeading>
      <ProblemSolver region={v.profile.region} owner={v.user.id} />
    </>
  );
}
