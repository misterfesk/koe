import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { conversation, message } from "../db/schema";
import { open, seal } from "../crypto";

export type { TalkMode } from "@/domain/talk";
import type { TalkMode } from "@/domain/talk";

export type { Proposals, ToolProposal } from "@/domain/talk-tools";
import {
  readProposals,
  type Proposals,
  type ToolProposal,
  type ToolStatus,
} from "@/domain/talk-tools";

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
        ? readProposals(JSON.parse(open(m.proposalsEnc)))
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
      proposalsEnc: proposals?.tools.length
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

/** One message with its offers, for the person who owns it. */
export async function getMessage(db: Db, userId: string, messageId: string) {
  const [row] = await db
    .select()
    .from(message)
    .where(and(eq(message.userId, userId), eq(message.id, messageId)));
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    sealed: row.proposalsEnc,
    proposals: row.proposalsEnc
      ? readProposals(JSON.parse(open(row.proposalsEnc)))
      : null,
  };
}

/**
 * Replaces a message's offers only if they are still exactly what the caller
 * read (compared as the stored ciphertext). Two requests racing to answer the
 * same card therefore have one winner; the other sees `false` and writes nothing.
 */
export async function swapProposals(
  db: Db,
  userId: string,
  messageId: string,
  expected: string | null,
  next: Proposals,
) {
  if (expected === null) return false;
  const rows = await db
    .update(message)
    .set({ proposalsEnc: seal(JSON.stringify(next)) })
    .where(
      and(
        eq(message.userId, userId),
        eq(message.id, messageId),
        eq(message.proposalsEnc, expected),
      ),
    )
    .returning({ id: message.id });
  return rows.length === 1;
}

export type ToolUpdate =
  { ok: true; tool: ToolProposal } | { ok: false; tool: ToolProposal | null };

/**
 * Changes one card on a message, but only while it is still `from`. A card
 * can be answered once: of two requests racing to answer it, one gets
 * `ok: true` and the other gets the card as it now stands.
 */
export async function updateTool(
  db: Db,
  userId: string,
  messageId: string,
  toolId: string,
  from: ToolStatus,
  patch: Partial<Pick<ToolProposal, "status" | "result" | "startedAt">>,
): Promise<ToolUpdate> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await getMessage(db, userId, messageId);
    const tool = msg?.proposals?.tools.find((t) => t.id === toolId);
    if (!msg?.proposals || !tool) return { ok: false, tool: null };
    if (tool.status !== from) return { ok: false, tool };
    const next = { ...tool, ...patch };
    const won = await swapProposals(db, userId, messageId, msg.sealed, {
      tools: msg.proposals.tools.map((t) => (t.id === toolId ? next : t)),
    });
    if (won) return { ok: true, tool: next };
  }
  return { ok: false, tool: null };
}

/**
 * Searches the person agreed to (find_resources cards they confirmed). The
 * Shelf reads these, runs the search with the stored query and fills the
 * Shelf; until then a confirmed card is only a request.
 */
export async function requestedSearches(db: Db, userId: string) {
  const rows = await db
    .select({
      id: message.id,
      conversationId: message.conversationId,
      enc: message.proposalsEnc,
    })
    .from(message)
    .where(
      and(eq(message.userId, userId), sql`${message.proposalsEnc} is not null`),
    );
  return rows.flatMap((r) =>
    (readProposals(JSON.parse(open(r.enc!)))?.tools ?? [])
      .filter(
        (t) =>
          t.name === "find_resources" &&
          t.status === "done" &&
          (t.result === "Koe will look for this and put it on your Shelf." ||
            (t.result === "Working on it." &&
              (!t.startedAt ||
                Date.parse(t.startedAt) < Date.now() - 120_000))),
      )
      .map((t) => ({
        messageId: r.id,
        proposalId: t.id,
        requestId: `${r.conversationId}:${t.id}`,
        query: t.query ?? "",
        tags: t.args,
      })),
  );
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
