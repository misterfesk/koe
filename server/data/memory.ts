import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { memoryCard, memoryKinds } from "../db/schema";
import { open, seal } from "../crypto";

export type MemoryKind = (typeof memoryKinds)[number];

export type MemoryView = {
  id: string;
  kind: MemoryKind;
  text: string;
  source: "you" | "talk" | "report" | "intro";
  useForSuggestions: boolean;
  createdAt: string;
};

export const memoryKindLabels: Record<MemoryKind, string> = {
  helps: "What helps",
  hard: "What gets in the way",
  people: "People",
  preference: "How you like things",
};

export async function listMemory(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(memoryCard)
    .where(eq(memoryCard.userId, userId))
    .orderBy(desc(memoryCard.createdAt));
  return rows.map((r): MemoryView => ({
    id: r.id,
    kind: r.kind,
    text: open(r.textEnc),
    source: r.source,
    useForSuggestions: r.useForSuggestions,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addMemory(
  db: Db,
  userId: string,
  card: {
    kind: MemoryKind;
    text: string;
    source: MemoryView["source"];
    sourceRef?: string;
  },
) {
  const [row] = await db
    .insert(memoryCard)
    .values({
      userId,
      kind: card.kind,
      textEnc: seal(card.text),
      source: card.source,
      sourceRef: card.sourceRef ?? null,
    })
    .returning({ id: memoryCard.id });
  return row.id;
}

export async function updateMemory(
  db: Db,
  userId: string,
  id: string,
  change: { text?: string; kind?: MemoryKind; useForSuggestions?: boolean },
) {
  await db
    .update(memoryCard)
    .set({
      ...(change.text !== undefined ? { textEnc: seal(change.text) } : {}),
      ...(change.kind ? { kind: change.kind } : {}),
      ...(change.useForSuggestions !== undefined
        ? { useForSuggestions: change.useForSuggestions }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(memoryCard.userId, userId), eq(memoryCard.id, id)));
}

export async function deleteMemory(db: Db, userId: string, id: string) {
  await db
    .delete(memoryCard)
    .where(and(eq(memoryCard.userId, userId), eq(memoryCard.id, id)));
}
