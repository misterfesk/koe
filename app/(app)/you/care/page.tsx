import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { weekSummary } from "@/domain/journey";
import { addDays } from "@/domain/time";
import { CarePreparation } from "@/features/connect/care";
import { listCheckIns } from "@/server/data/notes";
import { listSteps } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Prepare for an appointment" };

const SPAN = 28;

export default async function Page() {
  const v = await requireViewer();
  const from = addDays(v.today, -(SPAN - 1));
  const [steps, checkIns] = await Promise.all([
    listSteps(v.db, v.user.id),
    listCheckIns(v.db, v.user.id, from),
  ]);
  const s = weekSummary(steps, from, v.today);
  const facts: string[] = [];
  if (checkIns.length) {
    const low = checkIns.filter((c) => c.energy === "low").length;
    facts.push(
      `In the last 4 weeks I checked in ${checkIns.length} times; energy was low on ${low} of those days.`,
    );
  }
  if (s.answered)
    facts.push(
      `I tried small everyday steps ${s.answered} times: ${s.done} done, ${s.partly} partly, ${s.not} not.`,
    );
  const helped = [...new Set(s.helped.map((h) => h.title))].slice(0, 5);
  if (helped.length) facts.push("What helped: " + helped.join("; ") + ".");
  const barriers = steps
    .flatMap((x) => x.reports)
    .filter((r) => r.day >= from && r.barrier)
    .map((r) => r.barrier!)
    .slice(0, 3);
  if (barriers.length)
    facts.push("What got in the way: " + barriers.join("; ") + ".");
  return (
    <>
      <PageHeading
        eyebrow="You · People"
        description="A short note to take to a doctor, therapist or other professional. It stays here unless you copy, print or save it."
      >
        Prepare for an appointment
      </PageHeading>
      <CarePreparation facts={facts} region={v.profile.region} />
    </>
  );
}
