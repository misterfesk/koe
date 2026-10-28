import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  reviewDate,
  weekDraftSchema,
  type WeekDraft,
  type WeekView,
} from "@/domain/week";
import { weekIssues } from "@/domain/piece-rules";
import { seal, open } from "../crypto";
import type { Db } from "../db";
import { week, weekItem, piece } from "../db/schema";

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
    items: await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        captured: JSON.parse(open(item.capturedEnc)),
        pieces: (
          await db
            .select()
            .from(piece)
            .where(and(eq(piece.weekItemId, item.id), eq(piece.userId, userId)))
            .orderBy(piece.order)
        ).map((p) => ({
          ...JSON.parse(open(p.dataEnc)),
          id: p.id,
          order: p.order,
          status: p.status,
        })),
      })),
    ),
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
  if (weekIssues(draft, input.eatingConcern).length)
    throw new Error("Check the words and sizes before saving.");
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
    const [row] = await tx
      .insert(weekItem)
      .values({
        userId,
        weekId: id,
        capturedEnc: seal(JSON.stringify(item.captured)),
        order: order + offset,
      })
      .returning({ id: weekItem.id });
    for (const [position, value] of item.pieces.entries())
      await tx.insert(piece).values({
        userId,
        weekItemId: row.id,
        dataEnc: seal(JSON.stringify(value)),
        order: position,
      });
  }
  return (await getWeek(tx, userId, id))!;
}
export async function saveWeek(db: Db, userId: string, input: WeekSave) {
  return db.transaction((tx) => saveWeekInTransaction(tx, userId, input));
}
