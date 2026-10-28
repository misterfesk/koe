import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { IntakeFlow } from "@/features/intake/intake-flow";
import { SafetyCheck } from "@/features/safety/safety-check";
import { uses12Hour } from "@/domain/time";
import { hasIntro } from "@/server/data/intake";
import { env } from "@/server/env";
import { pushConfigured } from "@/server/push";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Plan your first day" };

export default async function Page() {
  const v = await requireViewer();
  // Someone who has done the intro goes straight to their day.
  if (await hasIntro(v.db, v.user.id)) redirect("/today");
  if (v.profile.coachingPausedAt)
    return (
      <>
        <PageHeading eyebrow="Welcome">Plan your first day</PageHeading>
        <SafetyCheck region={v.profile.region} />
      </>
    );
  return (
    <IntakeFlow
      region={v.profile.region}
      publicKey={pushConfigured() ? (env().VAPID_PUBLIC_KEY ?? "stub") : null}
      hour12={uses12Hour((await headers()).get("accept-language"))}
    />
  );
}
