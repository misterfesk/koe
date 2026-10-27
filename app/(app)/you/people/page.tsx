import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { FollowUps, People, ReachOut } from "@/features/connect/reach-out";
import stepStyles from "@/features/steps/steps.module.css";
import { listPeople, listReachOuts } from "@/server/data/people";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "People in your corner" };

export default async function Page() {
  const v = await requireViewer();
  const [people, reachOuts] = await Promise.all([
    listPeople(v.db, v.user.id),
    listReachOuts(v.db, v.user.id),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="You · People"
        description="People tend to underestimate how glad others are to hear from them. Koe helps you start; you send it yourself."
      >
        Reach out to someone
      </PageHeading>
      <ReachOut people={people} region={v.profile.region} />
      <FollowUps items={reachOuts} people={people} />
      <div className={stepStyles.starts} style={{ marginTop: 36 }}>
        <Link className={stepStyles.start} href="/you/care">
          <strong>Prepare for an appointment</strong>
          <span>
            A short summary of how things have been, and what you want to ask.
          </span>
        </Link>
        <Link className={stepStyles.start} href="/help">
          <strong>Need someone now?</strong>
          <span>Help now lists people you can reach in your region.</span>
        </Link>
      </div>
      <People people={people} />
    </>
  );
}
