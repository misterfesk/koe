import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { Help } from "@/features/help/help";
import { helpResources } from "@/fixtures/help-resources";
import { getViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const asked = (await searchParams).region?.toUpperCase();
  const viewer = await getViewer();
  const region =
    asked &&
    (asked === "OTHER" || helpResources.some((r) => r.region === asked))
      ? asked
      : (viewer?.profile?.region ?? "OTHER");
  return (
    <>
      <PageHeading
        eyebrow="Help"
        description="Koe can't check on you, assess danger or contact anyone. These services are run by people who can."
      >
        Reach a person who can help.
      </PageHeading>
      <Help key={region} region={region} />
    </>
  );
}
