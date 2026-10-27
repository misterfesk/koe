import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { step, stepReport, stepVersion } from "../db/schema";
import { open, seal } from "../crypto";
import { asKind, type PlanOrigin, type PlanSize } from "@/domain/plan-menu";
import { addDays } from "@/domain/time";
import type {
  Helped,
  Outcome,
  ReportView,
  StepView,
  StepStatus,
} from "@/domain/steps";

const sealOrNull = (v: string | null | undefined) => (v ? seal(v) : null);
const openOrNull = (v: string | null) => (v ? open(v) : null);

type StepRow = typeof step.$inferSelect;
type ReportRow = typeof stepReport.$inferSelect;

function toReport(r: ReportRow): ReportView {
  return {
    id: r.id,
    version: r.version,
    day: r.day,
    outcome: r.outcome,
    helped: r.helped,
    expectation: r.expectation,
    barrier: openOrNull(r.barrierEnc),
    note: openOrNull(r.noteEnc),
  };
}

async function hydrate(db: Db, userId: string, rows: StepRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [reports, versions] = await Promise.all([
    db
      .select()
      .from(stepReport)
      .where(
        and(eq(stepReport.userId, userId), inArray(stepReport.stepId, ids)),
      )
      .orderBy(desc(stepReport.day), desc(stepReport.createdAt)),
    db
      .select()
      .from(stepVersion)
      .where(
        and(eq(stepVersion.userId, userId), inArray(stepVersion.stepId, ids)),
      )
      .orderBy(stepVersion.version),
  ]);
  return rows.map((r): StepView => ({
    id: r.id,
    area: r.area,
    title: open(r.titleEnc),
    cue: openOrNull(r.cueEnc),
    expectation: r.expectation,
    problem: openOrNull(r.problemEnc),
    status: r.status,
    repeatDays: r.repeatDays?.length ? r.repeatDays : null,
    plannedFor: r.plannedFor,
    version: r.version,
    sourceMemoryId: r.sourceMemoryId,
    kind: asKind(r.kind),
    minuteOfDay: r.minuteOfDay,
    why: openOrNull(r.whyEnc),
    size: r.size,
    origin: r.origin,
    createdAt: r.createdAt.toISOString(),
    reports: reports.filter((x) => x.stepId === r.id).map(toReport),
    versions: versions
      .filter((v) => v.stepId === r.id)
      .map((v) => ({
        version: v.version,
        title: open(v.titleEnc),
        cue: openOrNull(v.cueEnc),
      })),
  }));
}

export async function listSteps(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(step)
    .where(eq(step.userId, userId))
    .orderBy(desc(step.createdAt));
  return hydrate(db, userId, rows);
}

export async function getStep(db: Db, userId: string, id: string) {
  const rows = await db
    .select()
    .from(step)
    .where(and(eq(step.userId, userId), eq(step.id, id)));
  return (await hydrate(db, userId, rows))[0] ?? null;
}

export type NewStep = {
  area: StepView["area"];
  title: string;
  cue?: string | null;
  expectation?: StepView["expectation"];
  problem?: string | null;
  when: "today" | "tomorrow" | "repeat";
  repeatDays?: number[];
  sourceMemoryId?: string | null;
  sourceConversationId?: string | null;
  /** Day-plan fields, set for items that came from a plan. */
  id?: string;
  kind?: StepView["kind"];
  minuteOfDay?: number | null;
  why?: string | null;
  size?: PlanSize | null;
  origin?: PlanOrigin | null;
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Inserts a step and its first version inside a transaction the caller owns. */
export async function insertStep(
  tx: Tx,
  userId: string,
  input: NewStep,
  today: string,
) {
  const [row] = await tx
    .insert(step)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId,
      area: input.area,
      titleEnc: seal(input.title),
      cueEnc: sealOrNull(input.cue),
      expectation: input.expectation ?? null,
      problemEnc: sealOrNull(input.problem),
      repeatDays: input.when === "repeat" ? (input.repeatDays ?? []) : null,
      plannedFor:
        input.when === "repeat"
          ? null
          : input.when === "tomorrow"
            ? addDays(today, 1)
            : today,
      sourceMemoryId: input.sourceMemoryId ?? null,
      sourceConversationId: input.sourceConversationId ?? null,
      kind: input.kind ?? null,
      minuteOfDay: input.minuteOfDay ?? null,
      whyEnc: sealOrNull(input.why),
      size: input.size ?? null,
      origin: input.origin ?? null,
    })
    .returning({ id: step.id });
  await tx.insert(stepVersion).values({
    userId,
    stepId: row.id,
    version: 1,
    titleEnc: seal(input.title),
    cueEnc: sealOrNull(input.cue),
  });
  return row.id;
}

export async function createStep(
  db: Db,
  userId: string,
  input: NewStep,
  today: string,
) {
  return db.transaction((tx) => insertStep(tx, userId, input, today));
}

async function owned(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(step)
    .where(and(eq(step.userId, userId), eq(step.id, id)));
  return row ?? null;
}

/**
 * Records how a step went today. Tapping again the same day changes the
 * answer instead of adding a second report. A one-off that was done is
 * finished; any other answer keeps it active.
 */
export async function reportStep(
  db: Db,
  userId: string,
  stepId: string,
  outcome: Outcome,
  today: string,
) {
  const s = await owned(db, userId, stepId);
  if (!s) return null;
  return db.transaction(async (tx) => {
    // The unique (step, day) index makes a double tap or a race an update.
    const [row] = await tx
      .insert(stepReport)
      .values({
        userId,
        stepId,
        version: s.version,
        day: today,
        outcome,
        expectation: s.expectation,
      })
      .onConflictDoUpdate({
        target: [stepReport.stepId, stepReport.day],
        set: { outcome, version: s.version, updatedAt: new Date() },
      })
      .returning({ id: stepReport.id });
    const id = row.id;
    const oneOff = !s.repeatDays?.length;
    if (oneOff && (s.status === "active" || s.status === "finished")) {
      await tx
        .update(step)
        .set({
          status: outcome === "done" ? "finished" : "active",
          updatedAt: new Date(),
        })
        .where(eq(step.id, stepId));
    }
    return id;
  });
}

export async function addReportDetail(
  db: Db,
  userId: string,
  reportId: string,
  detail: {
    helped?: Helped | null;
    barrier?: string | null;
    note?: string | null;
  },
) {
  const set: Partial<ReportRow> = { updatedAt: new Date() };
  if (detail.helped !== undefined) set.helped = detail.helped;
  if (detail.barrier !== undefined) set.barrierEnc = sealOrNull(detail.barrier);
  if (detail.note !== undefined) set.noteEnc = sealOrNull(detail.note);
  const rows = await db
    .update(stepReport)
    .set(set)
    .where(and(eq(stepReport.userId, userId), eq(stepReport.id, reportId)))
    .returning({ stepId: stepReport.stepId });
  return rows[0]?.stepId ?? null;
}

/** Takes back a report, for "undo" right after tapping. */
export async function undoReport(db: Db, userId: string, reportId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .delete(stepReport)
      .where(and(eq(stepReport.userId, userId), eq(stepReport.id, reportId)))
      .returning({ stepId: stepReport.stepId });
    if (!r) return null;
    await tx
      .update(step)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(step.userId, userId),
          eq(step.id, r.stepId),
          eq(step.status, "finished"),
        ),
      );
    return r.stepId;
  });
}

/** A new wording (usually a smaller version). Earlier reports keep theirs. */
export async function reviseStep(
  db: Db,
  userId: string,
  stepId: string,
  change: { title: string; cue?: string | null },
) {
  const s = await owned(db, userId, stepId);
  if (!s) return false;
  const version = s.version + 1;
  const cueEnc = change.cue === undefined ? s.cueEnc : sealOrNull(change.cue);
  await db.transaction(async (tx) => {
    await tx
      .update(step)
      .set({
        titleEnc: seal(change.title),
        cueEnc,
        version,
        status: s.status === "finished" ? "active" : s.status,
        updatedAt: new Date(),
      })
      .where(eq(step.id, stepId));
    await tx.insert(stepVersion).values({
      userId,
      stepId,
      version,
      titleEnc: seal(change.title),
      cueEnc,
    });
  });
  return true;
}

export async function setStepStatus(
  db: Db,
  userId: string,
  stepId: string,
  status: StepStatus,
) {
  const rows = await db
    .update(step)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(step.userId, userId), eq(step.id, stepId)))
    .returning({ id: step.id });
  return rows.length > 0;
}

/** Changes when a step shows on Today. */
export async function rescheduleStep(
  db: Db,
  userId: string,
  stepId: string,
  when: { plannedFor: string } | { repeatDays: number[] },
) {
  const rows = await db
    .update(step)
    .set({
      ...("plannedFor" in when
        ? { plannedFor: when.plannedFor, repeatDays: null }
        : { repeatDays: when.repeatDays, plannedFor: null }),
      status: "active",
      updatedAt: new Date(),
    })
    .where(and(eq(step.userId, userId), eq(step.id, stepId)))
    .returning({ id: step.id });
  return rows.length > 0;
}

export async function deleteStep(db: Db, userId: string, stepId: string) {
  const rows = await db
    .delete(step)
    .where(and(eq(step.userId, userId), eq(step.id, stepId)))
    .returning({ id: step.id });
  return rows.length > 0;
}

/** Archives one-off steps from before `before` that were never reported. */
export async function letGoOfOld(db: Db, userId: string, before: string) {
  const steps = await listSteps(db, userId);
  const stale = steps.filter(
    (s) =>
      s.status === "active" &&
      !s.repeatDays &&
      (s.plannedFor ?? "") < before &&
      s.reports.length === 0,
  );
  if (stale.length)
    await db
      .update(step)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(step.userId, userId),
          inArray(
            step.id,
            stale.map((s) => s.id),
          ),
        ),
      );
  return stale.length;
}
