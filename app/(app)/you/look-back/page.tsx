import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { weekSummary } from "@/domain/journey";
import { addDays, readableDay, weekStart } from "@/domain/time";
import { WeekDecisions } from "@/features/journey/week";
import { getWeeklyReview } from "@/server/data/notes";
import { listSteps } from "@/server/data/steps";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Weekly look-back" };

export default async function Page() {
  const v = await requireViewer();
  const from = addDays(v.today, -6);
  const [steps, saved] = await Promise.all([
    listSteps(v.db, v.user.id),
    getWeeklyReview(v.db, v.user.id, weekStart(v.today)),
  ]);
  const s = weekSummary(steps, from, v.today);
  const active = steps
    .filter((x) => x.status === "active")
    .map((x) => ({ id: x.id, title: x.title }));
  return (
    <>
      <PageHeading
        eyebrow="You · Look back"
        description="About three minutes. Nothing here is graded."
      >
        Your last seven days
      </PageHeading>
      <section aria-labelledby="counts" className="panel">
        <h2 id="counts">What happened</h2>
        {s.answered === 0 ? (
          <p>No answers from your day yet. You can still save a note.</p>
        ) : (
          <p>
            You said how it went {s.answered}{" "}
            {s.answered === 1 ? "time" : "times"}: {s.done} done, {s.partly}{" "}
            partly, {s.not} not this time. Every answer counts, including
            &ldquo;not this time&rdquo;.
          </p>
        )}
        {s.helped.length > 0 && (
          <>
            <h3>What you said helped</h3>
            <ul className="plain-list">
              {s.helped.map((h, i) => (
                <li key={i}>
                  {h.title}{" "}
                  <span className="meta">({readableDay(h.day, v.today)})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.surprises.length > 0 && (
          <>
            <h3>Better than you expected</h3>
            <p>
              {s.surprises.length === 1
                ? "Once this week"
                : `${s.surprises.length} times this week`}
              , you didn&apos;t expect something to help, and then it did. Low
              mood tends to predict things will go worse than they do.
            </p>
          </>
        )}
      </section>
      <WeekDecisions
        steps={active}
        initialNote={saved?.note ?? ""}
        initialDecisions={saved?.decisions ?? {}}
        region={v.profile.region}
      />
    </>
  );
}
