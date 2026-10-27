import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "../db";
import { checkIn, note, weeklyReview, type WeeklyDecision } from "../db/schema";
import { open, seal } from "../crypto";
import type { Energy } from "@/domain/steps";

export type NoteView = {
  id: string;
  kind: "note" | "thought";
  text: string;
  energy: Energy | null;
  createdAt: string;
};

export async function listNotes(db: Db, userId: string, since?: Date) {
  const rows = await db
    .select()
    .from(note)
    .where(
      since
        ? and(eq(note.userId, userId), gte(note.createdAt, since))
        : eq(note.userId, userId),
    )
    .orderBy(desc(note.createdAt));
  return rows.map((r): NoteView => ({
    id: r.id,
    kind: r.kind,
    text: open(r.textEnc),
    energy: r.energy,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addNote(
  db: Db,
  userId: string,
  input: { text: string; energy?: Energy | null; kind?: "note" | "thought" },
) {
  const [row] = await db
    .insert(note)
    .values({
      userId,
      textEnc: seal(input.text),
      energy: input.energy ?? null,
      kind: input.kind ?? "note",
    })
    .returning({ id: note.id });
  return row.id;
}

export async function updateNote(
  db: Db,
  userId: string,
  id: string,
  text: string,
) {
  await db
    .update(note)
    .set({ textEnc: seal(text), updatedAt: new Date() })
    .where(and(eq(note.userId, userId), eq(note.id, id)));
}

export async function deleteNote(db: Db, userId: string, id: string) {
  await db.delete(note).where(and(eq(note.userId, userId), eq(note.id, id)));
}

export async function listCheckIns(db: Db, userId: string, sinceDay?: string) {
  return db
    .select({ day: checkIn.day, energy: checkIn.energy })
    .from(checkIn)
    .where(
      sinceDay
        ? and(eq(checkIn.userId, userId), gte(checkIn.day, sinceDay))
        : eq(checkIn.userId, userId),
    )
    .orderBy(desc(checkIn.day));
}

export async function getWeeklyReview(
  db: Db,
  userId: string,
  weekStart: string,
) {
  const [row] = await db
    .select()
    .from(weeklyReview)
    .where(
      and(
        eq(weeklyReview.userId, userId),
        eq(weeklyReview.weekStart, weekStart),
      ),
    );
  return row
    ? {
        weekStart: row.weekStart,
        note: row.noteEnc ? open(row.noteEnc) : null,
        decisions: row.decisions,
        createdAt: row.createdAt.toISOString(),
      }
    : null;
}

export async function listWeeklyReviews(db: Db, userId: string) {
  const rows = await db
    .select({
      weekStart: weeklyReview.weekStart,
      createdAt: weeklyReview.createdAt,
    })
    .from(weeklyReview)
    .where(eq(weeklyReview.userId, userId))
    .orderBy(desc(weeklyReview.weekStart));
  return rows;
}

export async function saveWeeklyReview(
  db: Db,
  userId: string,
  weekStart: string,
  input: { note: string | null; decisions: Record<string, WeeklyDecision> },
) {
  const values = {
    noteEnc: input.note ? seal(input.note) : null,
    decisions: input.decisions,
  };
  await db
    .insert(weeklyReview)
    .values({ userId, weekStart, ...values })
    .onConflictDoUpdate({
      target: [weeklyReview.userId, weeklyReview.weekStart],
      set: values,
    });
}
