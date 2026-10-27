import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { Place } from "@/features/settings/preferences";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Where you are" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading
        eyebrow="You · Where you are"
        description="Your region sets the phone numbers Help shows. Your timezone sets when your day starts."
      >
        Where you are
      </PageHeading>
      <Place
        region={v.profile.region ?? "OTHER"}
        timezone={v.profile.timezone}
      />
    </>
  );
}
