import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  readCaptured,
  reviewDate,
  reviewDue,
  tidyTitle,
  type CapturedThing,
  weekDraftSchema,
  type WeekDraft,
  type WeekView,
} from "@/domain/week";
import { safeInterviewText, titleProblem } from "@/domain/interview-text";
import { seal, open } from "../crypto";
import type { Db } from "../db";
import { step, stepReport, week, weekItem } from "../db/schema";
import { getUserModel } from "./intake";
import type { OpenThing } from "@/domain/week-picker";

export type WeekTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Reader = Db | WeekTx;
export type WeekSave = {
  draft: WeekDraft;
  today: string;
  eatingConcern: boolean;
  weekId?: string;
  expectedVersion?: number;
  createId?: string;
};
export async function getWeek(
  db: Reader,
  userId: string,
  id: string,
): Promise<WeekView | null> {
  const [row] = await db
    .select()
    .from(week)
    .where(and(eq(week.id, id), eq(week.userId, userId)));
  if (!row) return null;
  const items = await db
    .select()
    .from(weekItem)
    .where(and(eq(weekItem.weekId, id), eq(weekItem.userId, userId)))
    .orderBy(weekItem.order);
  return {
    id: row.id,
    version: row.version,
    startedOn: row.startedOn,
    reviewOn: row.reviewOn,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    items: items.map((item) => ({
      id: item.id,
      captured: readCaptured(JSON.parse(open(item.capturedEnc))),
    })),
  };
}
export async function listWeeks(db: Reader, userId: string) {
  const rows = await db
    .select({ id: week.id })
    .from(week)
    .where(eq(week.userId, userId))
    .orderBy(desc(week.createdAt));
  return (
    await Promise.all(rows.map((row) => getWeek(db, userId, row.id)))
  ).filter((w): w is WeekView => !!w);
}
/** Call inside the SAME transaction as commitIntroInTransaction. Throws before partial writes. */
export async function saveWeekInTransaction(
  tx: WeekTx,
  userId: string,
  input: WeekSave,
) {
  const draft = weekDraftSchema.parse(input.draft);
  if (
    draft.items.some(
      (item) => !safeInterviewText(item.captured.title, input.eatingConcern),
    )
  )
    throw new Error("Check the titles before saving.");
  let id = input.weekId;
  let offset = 0;
  if (id) {
    const [current] = await tx
      .select()
      .from(week)
      .where(and(eq(week.id, id), eq(week.userId, userId)));
    if (input.createId && current?.approvalIds.includes(input.createId))
      return (await getWeek(tx, userId, id))!;
    if (!input.expectedVersion)
      throw new Error("Open this week again before saving.");
    // A reviewed week is closed; new things go in a new week.
    if (current?.reviewedAt)
      throw new Error("This week changed. Open it again before saving.");
    const updated = await tx
      .update(week)
      .set({
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
        approvalIds: [
          ...(current?.approvalIds ?? []),
          ...(input.createId ? [input.createId] : []),
        ],
      })
      .where(
        and(
          eq(week.id, id),
          eq(week.userId, userId),
          eq(week.version, input.expectedVersion),
        ),
      )
      .returning({ id: week.id });
    if (!updated.length)
      throw new Error("This week changed. Open it again before saving.");
    const existing = await tx
      .select({ id: weekItem.id })
      .from(weekItem)
      .where(and(eq(weekItem.weekId, id), eq(weekItem.userId, userId)));
    offset = existing.length;
    if (offset + draft.items.length > 3)
      throw new Error(
        "Your week already has three things. Review it before adding more.",
      );
  } else {
    if (input.createId) {
      const already = await getWeek(tx, userId, input.createId);
      if (already) return already;
    }
    const [row] = await tx
      .insert(week)
      .values({
        id: input.createId,
        userId,
        startedOn: input.today,
        reviewOn: reviewDate(input.today),
        labelEnc: seal("This week"),
        approvalIds: input.createId ? [input.createId] : [],
      })
      .returning({ id: week.id });
    id = row.id;
  }
  for (const [order, item] of draft.items.entries()) {
    await tx.insert(weekItem).values({
      userId,
      weekId: id,
      capturedEnc: seal(JSON.stringify(item.captured)),
      order: order + offset,
    });
  }
  return (await getWeek(tx, userId, id))!;
}
export async function saveWeek(db: Db, userId: string, input: WeekSave) {
  return db.transaction((tx) => saveWeekInTransaction(tx, userId, input));
}

/** A This week thing and what its plan entries recorded. */
export type ThingState = OpenThing & {
  /** Answered Not today (or skipped) twice or more; for the week review. */
  flagged: boolean;
  /** Answered Not today (or skipped) on `today`: it comes back another day. */
  letGoToday: boolean;
};

/**
 * Every thing in the person's newest week with its state, derived from the
 * answers on the plan entries made from it. Owner-scoped. Empty without a week.
 */
export async function weekThingStates(
  db: Reader,
  userId: string,
  today?: string,
): Promise<ThingState[]> {
  const [latest] = await db
    .select({ id: week.id, reviewedAt: week.reviewedAt })
    .from(week)
    .where(eq(week.userId, userId))
    .orderBy(desc(week.createdAt))
    .limit(1);
  // A reviewed week with no newer week means there is no week.
  if (!latest || latest.reviewedAt) return [];
  const current = await getWeek(db, userId, latest.id);
  if (!current?.items.length) return [];
  return withStates(db, userId, current.items, today);
}

/** One This week thing by id, from any of the person's weeks. Null for anyone else's. */
export async function weekThing(
  db: Reader,
  userId: string,
  id: string,
): Promise<ThingState | null> {
  const [row] = await db
    .select()
    .from(weekItem)
    .where(and(eq(weekItem.id, id), eq(weekItem.userId, userId)));
  if (!row) return null;
  const siblings = await db
    .select({ id: weekItem.id })
    .from(weekItem)
    .where(and(eq(weekItem.weekId, row.weekId), eq(weekItem.userId, userId)))
    .orderBy(weekItem.order);
  const [state] = await withStates(db, userId, [
    { id: row.id, captured: readCaptured(JSON.parse(open(row.capturedEnc))) },
  ]);
  return { ...state, position: siblings.findIndex((s) => s.id === row.id) };
}

async function withStates(
  db: Reader,
  userId: string,
  items: WeekView["items"],
  today?: string,
): Promise<ThingState[]> {
  const reports = await db
    .select({
      weekItemId: step.weekItemId,
      outcome: stepReport.outcome,
      day: stepReport.day,
    })
    .from(stepReport)
    .innerJoin(step, eq(step.id, stepReport.stepId))
    .where(
      and(
        eq(stepReport.userId, userId),
        eq(step.userId, userId),
        inArray(
          step.weekItemId,
          items.map((i) => i.id),
        ),
      ),
    );
  return items.map((item, position) => {
    const mine = reports.filter((r) => r.weekItemId === item.id);
    const not = mine.filter((r) => r.outcome === "not" || r.outcome === "skip");
    return {
      id: item.id,
      title: item.captured.title,
      what: item.captured.what,
      when: item.captured.when,
      position,
      done: mine.some((r) => r.outcome === "done"),
      partly: mine.filter((r) => r.outcome === "partly").length,
      notToday: not.length,
      flagged: not.length >= 2,
      letGoToday: !!today && not.some((r) => r.day === today),
    };
  });
}

/** The newest week when its review is due today and not yet answered, with each thing's state. */
export async function dueWeekReview(
  db: Reader,
  userId: string,
  today: string,
): Promise<{ week: WeekView; things: ThingState[] } | null> {
  const [latest] = await db
    .select({ id: week.id })
    .from(week)
    .where(eq(week.userId, userId))
    .orderBy(desc(week.createdAt))
    .limit(1);
  if (!latest) return null;
  const current = await getWeek(db, userId, latest.id);
  if (!current || current.reviewedAt || !reviewDue(current, today)) return null;
  return {
    week: current,
    things: await withStates(db, userId, current.items, today),
  };
}

export type ReviewDecision = {
  itemId: string;
  choice: "keep" | "change" | "let_go";
  title?: string;
  when?: string;
};
export type WeekReview = {
  weekId: string;
  expectedVersion: number;
  today: string;
  decisions: ReviewDecision[];
  /** The new week's id, chosen by the client so a retry saves once. */
  createId: string;
};

/**
 * Answers the newest week's review in one transaction: marks it reviewed and,
 * unless everything is let go, starts a new week (today + 7) with the kept and
 * changed things. Done things are never carried. Returns the new week or null.
 */
export async function reviewWeek(
  db: Db,
  userId: string,
  input: WeekReview,
): Promise<WeekView | null> {
  const eatingConcern = !!(await getUserModel(db, userId))?.model.eatingConcern;
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(week)
      .where(and(eq(week.id, input.weekId), eq(week.userId, userId)));
    if (!current) throw new Error("Open this week again before saving.");
    // A retry of a saved review returns what the first one saved.
    if (current.approvalIds.includes(input.createId))
      return getWeek(tx, userId, input.createId);
    const [latest] = await tx
      .select({ id: week.id })
      .from(week)
      .where(eq(week.userId, userId))
      .orderBy(desc(week.createdAt))
      .limit(1);
    if (
      latest?.id !== current.id ||
      current.reviewedAt ||
      current.version !== input.expectedVersion ||
      !reviewDue(current, input.today)
    )
      throw new Error("This week changed. Open it again before saving.");
    const view = (await getWeek(tx, userId, current.id))!;
    const states = await withStates(tx, userId, view.items);
    const openThings = states.filter((t) => !t.done);
    const byId = new Map(input.decisions.map((d) => [d.itemId, d]));
    if (
      byId.size !== input.decisions.length ||
      byId.size !== openThings.length ||
      openThings.some((t) => !byId.has(t.id))
    )
      throw new Error("This week changed. Open it again before saving.");
    const topics = await tx
      .select({ id: weekItem.id, topic: weekItem.topic })
      .from(weekItem)
      .where(and(eq(weekItem.weekId, current.id), eq(weekItem.userId, userId)));
    const carried: { captured: CapturedThing; topic: string | null }[] = [];
    for (const thing of openThings) {
      const decision = byId.get(thing.id)!;
      const item = view.items.find((i) => i.id === thing.id)!;
      if (decision.choice === "let_go") continue;
      if (decision.choice === "keep") {
        carried.push({
          captured: item.captured,
          topic: topics.find((t) => t.id === thing.id)?.topic ?? null,
        });
        continue;
      }
      const when = (decision.when ?? "").trim();
      const title = tidyTitle(decision.title ?? "", when);
      if (!title) throw new Error("Give it a few words.");
      const problem =
        titleProblem(title, eatingConcern) ??
        (when ? titleProblem(when, eatingConcern) : null);
      if (problem) throw new Error(problem);
      // Risk words are screened by the action first; this is the last guard.
      if (
        !safeInterviewText(title, eatingConcern) ||
        (when && !safeInterviewText(when, eatingConcern))
      )
        throw new Error("Try different words for this one.");
      const same = title === item.captured.title;
      carried.push({
        captured: {
          what: same ? item.captured.what : title,
          when,
          title,
        },
        // Unchanged words keep their Shelf topic; new words are classified again.
        topic:
          same && when === item.captured.when
            ? (topics.find((t) => t.id === thing.id)?.topic ?? null)
            : null,
      });
    }
    const marked = await tx
      .update(week)
      .set({
        reviewedAt: new Date(),
        version: current.version + 1,
        updatedAt: new Date(),
        approvalIds: [...current.approvalIds, input.createId],
      })
      .where(
        and(
          eq(week.id, current.id),
          eq(week.userId, userId),
          eq(week.version, current.version),
        ),
      )
      .returning({ id: week.id });
    if (!marked.length)
      throw new Error("This week changed. Open it again before saving.");
    if (!carried.length) return null;
    const saved = await saveWeekInTransaction(tx, userId, {
      draft: { items: carried.map(({ captured }) => ({ captured })) },
      today: input.today,
      eatingConcern,
      createId: input.createId,
    });
    for (const [order, item] of carried.entries())
      if (item.topic)
        await tx
          .update(weekItem)
          .set({ topic: item.topic })
          .where(
            and(
              eq(weekItem.weekId, saved.id),
              eq(weekItem.userId, userId),
              eq(weekItem.order, order),
            ),
          );
    return saved;
  });
}

/** A thing's state in words, for Talk's context: "done", "moved forward 2 times". */
export function thingState(t: OpenThing): string {
  if (t.done) return "done";
  const times = (n: number) => (n === 1 ? "1 time" : `${n} times`);
  const parts = [
    ...(t.partly ? [`moved forward ${times(t.partly)}`] : []),
    ...(t.notToday ? [`not today ${times(t.notToday)}`] : []),
  ];
  return parts.length ? parts.join(", ") : "not started";
}
