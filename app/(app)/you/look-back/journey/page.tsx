import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeading } from "@/components/ui";
import { MIN_RATINGS, patterns, ratingCount } from "@/domain/journey";
import { helpedLabels, outcomeLabels } from "@/domain/steps";
import { addDays, localDay, readableDay } from "@/domain/time";
import { NoteItem, PatternCard } from "@/features/journey/parts";
import styles from "@/features/journey/journey.module.css";
import { modeLabels } from "@/domain/talk";
import { listMemory } from "@/server/data/memory";
import { listCheckIns, listNotes } from "@/server/data/notes";
import { listSteps } from "@/server/data/steps";
import { listConversations } from "@/server/data/talk";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Journey" };

type Entry = { day: string; at: string; key: string; node: React.ReactNode };

const energyLabel = { low: "Low", okay: "Okay", more: "More than usual" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const v = await requireViewer();
  const span = Math.min(Number((await searchParams).days) || 30, 365);
  const since = addDays(v.today, -span + 1);
  const tz = v.profile.timezone;
  const [steps, notes, checkIns, talks, memory] = await Promise.all([
    listSteps(v.db, v.user.id),
    listNotes(v.db, v.user.id),
    listCheckIns(v.db, v.user.id, since),
    listConversations(v.db, v.user.id, 200),
    listMemory(v.db, v.user.id),
  ]);
  const entries: Entry[] = [];
  for (const s of steps)
    for (const r of s.reports)
      if (r.day >= since)
        entries.push({
          day: r.day,
          at: r.day + "T12",
          key: "r" + r.id,
          node: (
            <>
              <p className="meta">
                Step · {outcomeLabels[r.outcome]}
                {r.helped ? " · " + helpedLabels[r.helped] : ""}
              </p>
              <p>
                <Link href={"/steps/" + s.id}>{s.title}</Link>
              </p>
              {r.barrier && (
                <p className="note-text">In the way: {r.barrier}</p>
              )}
              {r.note && <p className="note-text">{r.note}</p>}
            </>
          ),
        });
  for (const n of notes) {
    const day = localDay(tz, new Date(n.createdAt));
    if (day < since) continue;
    entries.push({
      day,
      at: n.createdAt,
      key: "n" + n.id,
      node: (
        <>
          <p className="meta">
            Note{n.energy ? " · Energy: " + energyLabel[n.energy] : ""}
          </p>
          <NoteItem id={n.id} text={n.text} region={v.profile.region} />
        </>
      ),
    });
  }
  for (const c of checkIns)
    entries.push({
      day: c.day,
      at: c.day + "T00",
      key: "c" + c.day,
      node: <p className="meta">Energy check-in · {energyLabel[c.energy]}</p>,
    });
  for (const t of talks) {
    const day = localDay(tz, new Date(t.updatedAt));
    if (day < since) continue;
    entries.push({
      day,
      at: t.updatedAt,
      key: "t" + t.id,
      node: (
        <>
          <p className="meta">Talk · {modeLabels[t.mode]}</p>
          <p>
            <Link href={"/talk/" + t.id}>{t.title}</Link>
          </p>
        </>
      ),
    });
  }
  for (const m of memory) {
    const day = localDay(tz, new Date(m.createdAt));
    if (day < since) continue;
    entries.push({
      day,
      at: m.createdAt,
      key: "m" + m.id,
      node: (
        <>
          <p className="meta">Memory card kept</p>
          <p>{m.text}</p>
        </>
      ),
    });
  }
  entries.sort((a, b) => (a.at < b.at ? 1 : -1));
  const days = [...new Set(entries.map((e) => e.day))].sort().reverse();
  const found = patterns(steps, v.profile.dismissedPatterns);
  const ratings = ratingCount(steps);

  return (
    <>
      <PageHeading
        eyebrow="You · Look back"
        description="What you did, what you said helped, and your notes. Only you can see this."
      >
        Your journey
      </PageHeading>

      <section aria-labelledby="noticed" className={styles.noticed}>
        <h2 id="noticed">What you&apos;ve noticed</h2>
        {found.length > 0 ? (
          <>
            <ul className={styles.patterns}>
              {found.map((p) => (
                <PatternCard
                  key={p.key}
                  pattern={p}
                  memoryOn={v.profile.memoryOn}
                />
              ))}
            </ul>
            <p className="meta">
              Counts from your own ratings. They show what you noticed, not what
              caused what.
            </p>
          </>
        ) : (
          <p className="meta">
            {ratings < MIN_RATINGS
              ? `After ${MIN_RATINGS} steps you've rated with "did it help?", simple counts appear here. So far: ${ratings}.`
              : "Nothing stands out yet. That's normal."}
          </p>
        )}
      </section>

      {days.length === 0 ? (
        <Empty>
          Nothing here yet. Steps you report on Today, notes and conversations
          show up here.
        </Empty>
      ) : (
        days.map((day) => (
          <section key={day} className={styles.day} aria-label={day}>
            <h2>{readableDay(day, v.today)}</h2>
            <ul className={styles.entries}>
              {entries
                .filter((e) => e.day === day)
                .map((e) => (
                  <li key={e.key}>{e.node}</li>
                ))}
            </ul>
          </section>
        ))
      )}
      {span < 365 && (
        <p>
          <Link href={"/you/look-back/journey?days=" + Math.min(span * 3, 365)}>
            Show earlier
          </Link>
        </p>
      )}
    </>
  );
}
