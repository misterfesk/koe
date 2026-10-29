import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeading } from "@/components/ui";
import { IntakeEntry } from "@/features/intake/intake-entry";
import { listWeeks } from "@/server/data/week";
import type { WeekView } from "@/domain/week";
import { SafetyCheck } from "@/features/safety/safety-check";
import { uses12Hour } from "@/domain/time";
import { hasIntro } from "@/server/data/intake";
import { env } from "@/server/env";
import { pushConfigured } from "@/server/push";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Plan your first day" };

export default async function Page() {
  const v = await requireViewer();
  if (v.profile.coachingPausedAt)
    return (
      <>
        <PageHeading eyebrow="Welcome">Plan your first day</PageHeading>
        <SafetyCheck region={v.profile.region} />
      </>
    );
  return (
    <IntakeEntry
      key={v.user.id}
      owner={v.user.id}
      hasIntro={await hasIntro(v.db, v.user.id)}
      week={currentWeek((await listWeeks(v.db, v.user.id))[0])}
      region={v.profile.region}
      publicKey={pushConfigured() ? (env().VAPID_PUBLIC_KEY ?? "stub") : null}
      hour12={uses12Hour((await headers()).get("accept-language"))}
    />
  );
}

/** A reviewed week with no newer one is closed: new things start a new week. */
function currentWeek(latest: WeekView | undefined) {
  return latest && !latest.reviewedAt ? latest : null;
}
