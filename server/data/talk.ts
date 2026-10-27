import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { conversation, message } from "../db/schema";
import { open, seal } from "../crypto";

export type { TalkMode } from "@/domain/talk";
import type { TalkMode } from "@/domain/talk";

export type Proposals = {
  step?: {
    title: string;
    area: "move" | "connect" | "care" | "do" | "enjoy";
    cue?: string;
  };
  memory?: { kind: "helps" | "hard" | "people" | "preference"; text: string };
};

export type MessageView = {
  id: string;
  role: "user" | "assistant" | "safety";
  content: string;
  proposals: Proposals | null;
  createdAt: string;
};

export type ConversationView = {
  id: string;
  mode: TalkMode;
  title: string;
  safetyPaused: boolean;
  updatedAt: string;
};

function toConversation(r: typeof conversation.$inferSelect): ConversationView {
  return {
    id: r.id,
    mode: r.mode,
    title: r.titleEnc ? open(r.titleEnc) : "Conversation",
    safetyPaused: !!r.safetyPausedAt,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listConversations(db: Db, userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt))
    .limit(limit);
  return rows.map(toConversation);
}

export async function getConversation(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.userId, userId), eq(conversation.id, id)));
  if (!row) return null;
  const messages = await db
    .select()
    .from(message)
    .where(and(eq(message.userId, userId), eq(message.conversationId, id)))
    .orderBy(asc(message.createdAt));
  return {
    ...toConversation(row),
    messages: messages.map((m): MessageView => ({
      id: m.id,
      role: m.role,
      content: open(m.contentEnc),
      proposals: m.proposalsEnc
        ? (JSON.parse(open(m.proposalsEnc)) as Proposals)
        : null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function startConversation(
  db: Db,
  userId: string,
  mode: TalkMode,
  title: string,
) {
  const [row] = await db
    .insert(conversation)
    .values({ userId, mode, titleEnc: seal(title) })
    .returning({ id: conversation.id });
  return row.id;
}

export async function addMessage(
  db: Db,
  userId: string,
  conversationId: string,
  role: MessageView["role"],
  content: string,
  proposals?: Proposals | null,
) {
  const [row] = await db
    .insert(message)
    .values({
      userId,
      conversationId,
      role,
      contentEnc: seal(content),
      proposalsEnc:
        proposals && (proposals.step || proposals.memory)
          ? seal(JSON.stringify(proposals))
          : null,
    })
    .returning({ id: message.id, createdAt: message.createdAt });
  await db
    .update(conversation)
    .set({ updatedAt: new Date() })
    .where(eq(conversation.id, conversationId));
  return row;
}

/** Marks an offer as answered so it isn't offered again. */
export async function clearProposal(
  db: Db,
  userId: string,
  messageId: string,
  which: keyof Proposals,
) {
  const [row] = await db
    .select()
    .from(message)
    .where(and(eq(message.userId, userId), eq(message.id, messageId)));
  if (!row?.proposalsEnc) return;
  const proposals = JSON.parse(open(row.proposalsEnc)) as Proposals;
  delete proposals[which];
  await db
    .update(message)
    .set({
      proposalsEnc:
        proposals.step || proposals.memory
          ? seal(JSON.stringify(proposals))
          : null,
    })
    .where(eq(message.id, messageId));
}

export async function setConversationPaused(
  db: Db,
  userId: string,
  id: string,
  paused: boolean,
) {
  await db
    .update(conversation)
    .set({ safetyPausedAt: paused ? new Date() : null })
    .where(and(eq(conversation.userId, userId), eq(conversation.id, id)));
}

export async function deleteConversation(db: Db, userId: string, id: string) {
  await db
    .delete(conversation)
    .where(and(eq(conversation.userId, userId), eq(conversation.id, id)));
}

/** Messages the person sent since `since`, for the daily cap. */
export async function countUserMessagesSince(
  db: Db,
  userId: string,
  since: Date,
) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(message)
    .where(
      and(
        eq(message.userId, userId),
        eq(message.role, "user"),
        gte(message.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/** When the person chose not to keep transcripts: drop chats older than a day. */
export async function purgeOldConversations(db: Db, userId: string) {
  await db
    .delete(conversation)
    .where(
      and(
        eq(conversation.userId, userId),
        lt(conversation.updatedAt, new Date(Date.now() - 86400_000)),
      ),
    );
}

/** For the scheduler: applies "chat history off" for everyone who chose it. */
export async function purgeExpiredTranscripts(db: Db) {
  await db.execute(sql`
    delete from "conversation" c
    using "profile" p
    where p."user_id" = c."user_id"
      and p."keep_transcripts" = false
      and c."updated_at" < now() - interval '1 day'
  `);
}
