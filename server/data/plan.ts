import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DayItem, KindOutcome } from "@/domain/day-plan";
import { asKind, kindAreas, type PlanOrigin } from "@/domain/plan-menu";
import type { Energy } from "@/domain/steps";
import type { Db } from "../db";
import { checkIn, planDay, step, stepReport } from "../db/schema";
import { open, seal } from "../crypto";
import { getPlanDay, type PlanDayView } from "./intake";
import { followItems, parkItems } from "./reminders";
import { insertStep } from "./steps";

// Writing a day's plan: every change is a new plan_day version plus the
// matching step rows, and the latest change can be undone. The pure rules
// (what to change, the diff) live in domain/day-plan.ts.

export type PlanReason =
  | "first_open"
  /** The model's plan for day 2 or later: a draft until the person keeps it. */
  | "draft"
  | "check_in"
  | "not_today_shrink"
  | "not_today_swap"
  | "not_today_move"
  | "not_today_let_go"
  | "lighter"
  | "add";

export type PlanWrite = {
  day: string;
  items: DayItem[];
  energy: Energy | null;
  mode: "normal" | "lighter";
  reason: PlanReason;
  /** Koe's one line about the change. */
  note: string | null;
  /** Where new items come from. */
  origin: PlanOrigin;
  /** Refuse unless this would be exactly this version (guards a race). */
  expectVersion?: number;
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function latestRow(tx: Tx | Db, userId: string, day: string) {
  const [row] = await tx
    .select()
    .from(planDay)
    .where(and(eq(planDay.userId, userId), eq(planDay.day, day)))
    .orderBy(desc(planDay.version))
    .limit(1);
  return row ?? null;
}

const snapshotIds = (sealed: string): string[] => {
  const parsed = JSON.parse(open(sealed)) as {
    items?: { stepId?: string }[];
  };
  return (parsed.items ?? []).flatMap((i) => (i.stepId ? [i.stepId] : []));
};

/**
 * Writes the next version of a day. The plan_day row goes first and is
 * unique per user, day and version, so two requests racing to write the same
 * version produce one winner; the other gets { ok: false } and writes nothing.
 */
export async function writePlanVersion(
  db: Db,
  userId: string,
  w: PlanWrite,
): Promise<{ ok: true; version: number; items: DayItem[] } | { ok: false }> {
  return db.transaction(async (tx) => {
    const prev = await latestRow(tx, userId, w.day);
    const version = (prev?.version ?? 0) + 1;
    if (w.expectVersion !== undefined && version !== w.expectVersion)
      return { ok: false as const };

    // Items that point at a step of this person's keep it; the rest are new.
    const wanted = w.items.flatMap((i) => (i.stepId ? [i.stepId] : []));
    const owned = wanted.length
      ? new Set(
          (
            await tx
              .select({ id: step.id })
              .from(step)
              .where(and(eq(step.userId, userId), inArray(step.id, wanted)))
          ).map((r) => r.id),
        )
      : new Set<string>();
    const items: DayItem[] = w.items.map((i) => ({
      ...i,
      stepId: i.stepId && owned.has(i.stepId) ? i.stepId : crypto.randomUUID(),
    }));

    const planned = await tx
      .insert(planDay)
      .values({
        userId,
        day: w.day,
        energy: w.energy,
        mode: w.mode,
        version,
        reason: w.reason,
        noteEnc: w.note ? seal(w.note) : null,
        snapshotEnc: seal(JSON.stringify({ items })),
      })
      .onConflictDoNothing()
      .returning({ id: planDay.id });
    if (!planned.length) return { ok: false as const };

    const before = prev ? snapshotIds(prev.snapshotEnc) : [];
    for (const item of items) {
      if (owned.has(item.stepId!)) {
        await tx
          .update(step)
          .set({
            minuteOfDay: item.minuteOfDay,
            whyEnc: seal(item.why),
            // A step put back on Today is active again; a finished one stays finished.
            status: sql`case when ${step.status} = 'archived' then 'active' else ${step.status} end`,
            updatedAt: new Date(),
          })
          .where(eq(step.id, item.stepId!));
        continue;
      }
      await insertStep(
        tx,
        userId,
        {
          id: item.stepId,
          area: kindAreas[item.kind],
          title: item.title,
          problem: item.problem,
          why: item.why,
          kind: item.kind,
          minuteOfDay: item.minuteOfDay,
          size: item.size,
          origin: w.origin,
          when: "today",
        },
        w.day,
      );
    }
    // Items the new version no longer has leave Today but stay in history.
    const keep = new Set(items.map((i) => i.stepId!));
    const gone = before.filter((id) => !keep.has(id));
    if (gone.length)
      await tx
        .update(step)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(step.userId, userId), inArray(step.id, gone)));
    // A reminder moves with its item, and stops with an item that left Today.
    // A swapped-in item is a new entry and starts with no reminder.
    await followItems(
      tx,
      userId,
      items.map((i) => i.stepId!).filter((id) => owned.has(id)),
    );
    await parkItems(tx, userId, gone);

    // A new day starts clean: yesterday's unfinished items are not carried over.
    if (w.reason === "first_open" || w.reason === "draft")
      await tx
        .update(step)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(step.userId, userId),
            eq(step.status, "active"),
            lt(step.plannedFor, w.day),
            sql`${step.origin} is not null`,
            sql`${step.repeatDays} is null`,
          ),
        );
    return { ok: true as const, version, items };
  });
}

const inflight = new Map<string, Promise<PlanDayView>>();

/**
 * Today's plan, made once. The first call of the day builds and saves it; a
 * second at the same moment shares the work, and if two servers race the
 * unique index lets one write and the other reads what it wrote.
 */
export async function ensureTodayPlan(
  db: Db,
  userId: string,
  today: string,
  produce: () => Promise<
    Omit<PlanWrite, "day" | "reason" | "expectVersion"> & {
      /** "draft" for a model-made plan on day 2 or later; otherwise "first_open". */
      reason?: Extract<PlanReason, "first_open" | "draft">;
    }
  >,
): Promise<PlanDayView> {
  const have = await getPlanDay(db, userId, today);
  if (have) return have;
  const key = `${userId}:${today}`;
  let work = inflight.get(key);
  if (!work) {
    work = (async () => {
      try {
        const made = await produce();
        await writePlanVersion(db, userId, {
          ...made,
          day: today,
          reason: made.reason ?? "first_open",
          expectVersion: 1,
        });
        return (await getPlanDay(db, userId, today))!;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, work);
  }
  return work;
}

/**
 * "Keep it" on a draft: the plan stays as the model wrote it and the draft
 * banner goes. Stored on the plan version itself, so it survives a reload.
 */
export async function keepDraft(db: Db, userId: string, day: string) {
  const latest = await latestRow(db, userId, day);
  if (!latest || latest.version !== 1 || latest.reason !== "draft")
    return { ok: false as const };
  await db
    .update(planDay)
    .set({ reason: "draft_kept" })
    .where(eq(planDay.id, latest.id));
  return { ok: true as const };
}

/**
 * Takes back the latest change to a day: the previous version's items come
 * back exactly as they were, and the version that made the change is removed.
 * Items that change added are archived (kept in history), and a "not today"
 * answer the change made for an item is taken back with it.
 */
export async function undoLastChange(db: Db, userId: string, day: string) {
  return db.transaction(async (tx) => {
    const latest = await latestRow(tx, userId, day);
    if (!latest || latest.version < 2 || latest.reason === "intro")
      return { ok: false as const };
    const [prev] = await tx
      .select()
      .from(planDay)
      .where(
        and(
          eq(planDay.userId, userId),
          eq(planDay.day, day),
          eq(planDay.version, latest.version - 1),
        ),
      );
    if (!prev) return { ok: false as const };
    const was = JSON.parse(open(prev.snapshotEnc)) as { items: DayItem[] };
    const now = snapshotIds(latest.snapshotEnc);
    const back = new Set(
      was.items.flatMap((i) => (i.stepId ? [i.stepId] : [])),
    );

    for (const item of was.items) {
      if (!item.stepId) continue;
      await tx
        .update(step)
        .set({
          minuteOfDay: item.minuteOfDay,
          whyEnc: seal(item.why),
          kind: item.kind,
          size: item.size,
          status: sql`case when ${step.status} = 'archived' then 'active' else ${step.status} end`,
          updatedAt: new Date(),
        })
        .where(and(eq(step.userId, userId), eq(step.id, item.stepId)));
    }
    // Items the change took off Today come back without the "not today" it recorded.
    const returned = was.items
      .flatMap((i) => (i.stepId ? [i.stepId] : []))
      .filter((id) => !now.includes(id));
    if (returned.length) {
      await tx
        .delete(stepReport)
        .where(
          and(
            eq(stepReport.userId, userId),
            eq(stepReport.day, day),
            eq(stepReport.outcome, "not"),
            inArray(stepReport.stepId, returned),
          ),
        );
    }
    const added = now.filter((id) => !back.has(id));
    if (added.length)
      await tx
        .update(step)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(step.userId, userId), inArray(step.id, added)));
    // Reminders go back to how they were: items that returned have theirs
    // again, at the restored time; items the change added lose theirs.
    await followItems(
      tx,
      userId,
      was.items.flatMap((i) => (i.stepId ? [i.stepId] : [])),
    );
    await parkItems(tx, userId, added);

    await tx
      .delete(planDay)
      .where(and(eq(planDay.userId, userId), eq(planDay.id, latest.id)));
    return { ok: true as const, version: prev.version };
  });
}

// --- What the planner needs to know about the recent past --------------------

/** Answers for plan items over the last seven days (today and the six before). */
export async function kindOutcomes(
  db: Db,
  userId: string,
  from: string,
): Promise<(KindOutcome & { vsExpected: string | null })[]> {
  const rows = await db
    .select({
      kind: step.kind,
      size: step.size,
      outcome: stepReport.outcome,
      day: stepReport.day,
      vs: stepReport.vsExpected,
    })
    .from(stepReport)
    .innerJoin(step, eq(step.id, stepReport.stepId))
    .where(
      and(
        eq(stepReport.userId, userId),
        sql`${stepReport.day} >= ${from}`,
        sql`${step.kind} is not null`,
        sql`${step.size} is not null`,
      ),
    );
  return rows.flatMap((r) => {
    const kind = asKind(r.kind);
    return kind && r.size
      ? [
          {
            kind,
            size: r.size,
            outcome: r.outcome,
            day: r.day,
            vsExpected: r.vs,
          },
        ]
      : [];
  });
}

/** The two latest earlier days that had a plan, newest first, with how many items were done or partly done. */
export async function previousDays(db: Db, userId: string, today: string) {
  const days = await db
    .selectDistinct({ day: planDay.day })
    .from(planDay)
    .where(and(eq(planDay.userId, userId), lt(planDay.day, today)))
    .orderBy(desc(planDay.day))
    .limit(2);
  const out: { day: string; active: number }[] = [];
  for (const { day } of days) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(stepReport)
      .where(
        and(
          eq(stepReport.userId, userId),
          eq(stepReport.day, day),
          inArray(stepReport.outcome, ["done", "partly"]),
        ),
      );
    out.push({ day, active: row?.n ?? 0 });
  }
  return out;
}

/** Whether any earlier day had a plan; the first day is gentler. */
export async function hasEarlierPlan(db: Db, userId: string, today: string) {
  const [row] = await db
    .select({ id: planDay.id })
    .from(planDay)
    .where(and(eq(planDay.userId, userId), lt(planDay.day, today)))
    .limit(1);
  return !!row;
}

export type TodayReport = {
  id: string;
  outcome: "done" | "partly" | "not" | "skip";
  vsExpected: "better" | "same" | "worse" | null;
};

export async function todayReports(db: Db, userId: string, today: string) {
  const rows = await db
    .select({
      id: stepReport.id,
      stepId: stepReport.stepId,
      outcome: stepReport.outcome,
      vs: stepReport.vsExpected,
    })
    .from(stepReport)
    .where(and(eq(stepReport.userId, userId), eq(stepReport.day, today)));
  return new Map<string, TodayReport>(
    rows.map((r) => [
      r.stepId,
      { id: r.id, outcome: r.outcome, vsExpected: r.vs },
    ]),
  );
}

export async function setVsExpected(
  db: Db,
  userId: string,
  reportId: string,
  value: "better" | "same" | "worse" | null,
) {
  const rows = await db
    .update(stepReport)
    .set({ vsExpected: value, updatedAt: new Date() })
    .where(and(eq(stepReport.userId, userId), eq(stepReport.id, reportId)))
    .returning({ id: stepReport.id });
  return rows.length > 0;
}

/** The version before the latest, for the "what changed" lines. */
export async function previousVersion(
  db: Db,
  userId: string,
  day: string,
  version: number,
) {
  const [row] = await db
    .select()
    .from(planDay)
    .where(
      and(
        eq(planDay.userId, userId),
        eq(planDay.day, day),
        eq(planDay.version, version - 1),
      ),
    );
  if (!row) return null;
  const parsed = JSON.parse(open(row.snapshotEnc)) as { items: DayItem[] };
  return parsed.items;
}

// --- Check-in -----------------------------------------------------------------

export type CheckInView = { energy: Energy; word: string | null };

export async function getCheckInView(
  db: Db,
  userId: string,
  day: string,
): Promise<CheckInView | null> {
  const [row] = await db
    .select()
    .from(checkIn)
    .where(and(eq(checkIn.userId, userId), eq(checkIn.day, day)));
  return row
    ? { energy: row.energy, word: row.wordEnc ? open(row.wordEnc) : null }
    : null;
}

export async function saveCheckIn(
  db: Db,
  userId: string,
  day: string,
  energy: Energy,
  word: string | null,
) {
  await db
    .insert(checkIn)
    .values({ userId, day, energy, wordEnc: word ? seal(word) : null })
    .onConflictDoUpdate({
      target: [checkIn.userId, checkIn.day],
      set: { energy, wordEnc: word ? seal(word) : null },
    });
}

export async function listCheckInWords(db: Db, userId: string) {
  const rows = await db
    .select({ day: checkIn.day, wordEnc: checkIn.wordEnc })
    .from(checkIn)
    .where(
      and(eq(checkIn.userId, userId), sql`${checkIn.wordEnc} is not null`),
    );
  return rows.map((r) => ({ day: r.day, word: open(r.wordEnc!) }));
}

// Re-exported so callers import the plan pieces from one place.
export { getPlanDay } from "./intake";
export type { PlanDayView } from "./intake";
