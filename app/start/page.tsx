import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { StartForm } from "@/features/onboarding/start";
import { getViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Start" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getViewer();
  if (viewer?.profile?.onboardedAt) redirect("/today");
  return (
    <>
      <PageHeading
        eyebrow="Start"
        description="One question and a checkbox. Then you're in."
      >
        Before you start
      </PageHeading>
      <StartForm />
    </>
  );
}
