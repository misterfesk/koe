import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { StepHistory } from "@/features/journey/entry-history";
import { getStep } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";
export const metadata: Metadata = { title: "From your day" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const v = await requireViewer();
  const { id } = await params;
  const entry = await getStep(v.db, v.user.id, id.slice(0, 64));
  return (
    <>
      <PageHeading eyebrow="You · Look back">
        {entry?.title ?? "This isn't here"}
      </PageHeading>
      {entry ? (
        <>
          <p className="meta">
            This is kept from your day. Change today&apos;s plan on Today.
          </p>
          {entry.cue && <p>{entry.cue}</p>}
          {entry.problem && (
            <section className="panel">
              <h2>What it is for</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{entry.problem}</p>
            </section>
          )}
          <StepHistory step={entry} today={v.today} />
        </>
      ) : (
        <p>It may have been deleted.</p>
      )}
      <p>
        <Link href="/today">Back to Today</Link>
      </p>
    </>
  );
}
