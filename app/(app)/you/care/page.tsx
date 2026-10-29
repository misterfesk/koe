import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { AppointmentLookup } from "@/features/connect/care";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Find appointment" };

export default async function Page() {
  const v = await requireViewer();
  return (
    <>
      <PageHeading eyebrow="You · Appointment">Find appointment</PageHeading>
      <AppointmentLookup region={v.profile.region} />
    </>
  );
}
