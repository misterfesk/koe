"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RiskLevel } from "@/domain/safety";
import { addDays } from "@/domain/time";
import { conversation, talkModes } from "../db/schema";
import { getCheckIn, recordSafetyEvent, updateProfile } from "../data/profile";
import { addMemory, listMemory } from "../data/memory";
import { listSteps } from "../data/steps";
import {
  addMessage,
  clearProposal,
  countUserMessagesSince,
  deleteConversation,
  getConversation,
  setConversationPaused,
  startConversation,
} from "../data/talk";
import { env } from "../env";
import { AiUnavailable } from "../llm/nebius";
import { classifyRisk, reply } from "../llm/talk";
import { screen } from "../safety";
import { requireViewer } from "../viewer";
import { outcomeLabels, helpedLabels } from "@/domain/steps";

const refresh = () => revalidatePath("/", "layout");

// Fixed text stored in place of a reply when the safety check fires. The
// app shows verified Help numbers next to it; the model never writes them.
const SAFETY_NOTE =
  "What you wrote sounds really hard, and I'm glad you said it. Your safety matters more than anything else here, so the usual conversation is paused.";

const DAILY_CAP = 200;

const input = z.object({
  conversationId: z.string().max(64).optional(),
  mode: z.enum(talkModes).default("talk"),
  text: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(4000, "That's a lot for one message. Try splitting it up."),
});

export type SendResult =
  | {
      ok: true;
      /** Null when nothing was saved because coaching is paused. */
      conversationId: string | null;
      safety: RiskLevel;
      unavailable?: boolean;
    }
  | { ok: false; error: string };

export async function sendMessage(
  raw: z.input<typeof input>,
): Promise<SendResult> {
  const v = await requireViewer();
  const parsed = input.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { text, mode } = parsed.data;

  const sent = await countUserMessagesSince(
    v.db,
    v.user.id,
    new Date(Date.now() - 86400_000),
  );
  if (sent >= DAILY_CAP)
    return {
      ok: false,
      error:
        "You've talked a lot with Koe today, so chat is resting until tomorrow. Your steps and Help now still work.",
    };

  let id = parsed.data.conversationId;
  let convo = id ? await getConversation(v.db, v.user.id, id) : null;
  if (id && !convo) return { ok: false, error: "This conversation is gone." };
  if (convo?.safetyPaused || v.profile.coachingPausedAt)
    return { ok: true, conversationId: id ?? null, safety: "concern" };
  if (!id) {
    const title = text.length > 60 ? text.slice(0, 57).trimEnd() + "…" : text;
    id = await startConversation(v.db, v.user.id, mode, title);
  }
  await addMessage(v.db, v.user.id, id, "user", text);

  const pause = async (level: RiskLevel) => {
    await setConversationPaused(v.db, v.user.id, id!, true);
    await addMessage(v.db, v.user.id, id!, "safety", SAFETY_NOTE);
    refresh();
    return { ok: true as const, conversationId: id!, safety: level };
  };

  // Layer 1: deterministic rules, which also work when the AI is off.
  const rules = await screen(v.db, v.user.id, "talk", [text]);
  if (rules !== "none") return pause(rules);

  if (env().KOE_AI === "off") {
    refresh();
    return { ok: true, conversationId: id, safety: "none", unavailable: true };
  }

  convo = await getConversation(v.db, v.user.id, id);
  const history = convo!.messages;
  // With memory off, nothing from the person's records goes to the model.
  const [memory, steps, energy] = v.profile.memoryOn
    ? await Promise.all([
        listMemory(v.db, v.user.id),
        listSteps(v.db, v.user.id),
        getCheckIn(v.db, v.user.id, v.today),
      ])
    : [[], [], null];
  const weekAgo = addDays(v.today, -7);
  const recentSteps = steps
    .flatMap((s) =>
      s.reports
        .filter((r) => r.day >= weekAgo)
        .map(
          (r) =>
            `"${s.title}": ${outcomeLabels[r.outcome].toLowerCase()}${r.helped ? ", " + helpedLabels[r.helped].toLowerCase() : ""} (${r.day})`,
        ),
    )
    .slice(0, 10);

  // Layer 2 (model check) runs alongside the reply to save time. A reply is
  // only shown if the check comes back clear: an error or timeout counts as
  // not cleared, so Koe says it can't reply rather than risk a normal answer.
  const chat = history.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
  const [risk, answer] = await Promise.all([
    classifyRisk(chat, v.user.id),
    reply(
      convo!.mode,
      history,
      {
        energy,
        memory: memory.filter((m) => m.useForSuggestions),
        recentSteps,
        turn: history.filter((m) => m.role === "user").length,
      },
      v.profile.memoryOn,
      v.user.id,
    ).catch((error: unknown) => {
      if (error instanceof AiUnavailable) return null;
      throw error;
    }),
  ]);

  if (risk && risk !== "none") {
    await recordSafetyEvent(v.db, v.user.id, {
      level: risk,
      source: "model",
      surface: "talk",
    });
    await updateProfile(v.db, v.user.id, { coachingPausedAt: new Date() });
    return pause(risk);
  }
  if (!answer || risk === null) {
    refresh();
    return { ok: true, conversationId: id, safety: "none", unavailable: true };
  }
  await addMessage(
    v.db,
    v.user.id,
    id,
    "assistant",
    answer.text,
    answer.proposals,
  );
  if (answer.risky) {
    // The reply itself touched on risk: keep it, but treat it like a hit.
    await recordSafetyEvent(v.db, v.user.id, {
      level: "concern",
      source: "model",
      surface: "talk-reply",
    });
    await updateProfile(v.db, v.user.id, { coachingPausedAt: new Date() });
    await setConversationPaused(v.db, v.user.id, id, true);
  }
  refresh();
  return {
    ok: true,
    conversationId: id,
    safety: answer.risky ? "concern" : "none",
  };
}

const ids = z.object({
  conversationId: z.string().max(64),
  messageId: z.string().max(64),
});

async function ownedMessage(conversationId: string, messageId: string) {
  const v = await requireViewer();
  const p = ids.parse({ conversationId, messageId });
  const convo = await getConversation(v.db, v.user.id, p.conversationId);
  const msg = convo?.messages.find((m) => m.id === p.messageId);
  return { v, convo, msg };
}

const memoryInput = z.object({
  kind: z.enum(["helps", "hard", "people", "preference"]),
  text: z
    .string()
    .trim()
    .min(3, "Write a few words, or choose No.")
    .max(200, "Use 200 characters or fewer."),
});

/** The person approved (and maybe edited) a memory card Koe proposed. */
export async function keepMemory(
  conversationId: string,
  messageId: string,
  card: z.input<typeof memoryInput>,
): Promise<{ ok: boolean; error?: string }> {
  const { v, msg } = await ownedMessage(conversationId, messageId);
  if (!msg?.proposals?.memory) return { ok: false, error: "Already answered." };
  const parsed = memoryInput.safeParse(card);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!v.profile.memoryOn)
    return { ok: false, error: "Memory is off. You can turn it on in You." };
  await addMemory(v.db, v.user.id, {
    ...parsed.data,
    source: "talk",
    sourceRef: conversationId,
  });
  await clearProposal(v.db, v.user.id, messageId, "memory");
  await screen(v.db, v.user.id, "memory", [parsed.data.text]);
  refresh();
  return { ok: true };
}

export async function declineProposal(
  conversationId: string,
  messageId: string,
  which: "step" | "memory",
) {
  const { v, msg } = await ownedMessage(conversationId, messageId);
  if (!msg) return;
  await clearProposal(v.db, v.user.id, messageId, which);
  refresh();
}

export async function removeConversation(conversationId: string) {
  const v = await requireViewer();
  await deleteConversation(
    v.db,
    v.user.id,
    z.string().max(64).parse(conversationId),
  );
  refresh();
}

/** After the safety check, the person chose to carry on. */
export async function resumeConversation(conversationId: string) {
  const v = await requireViewer();
  const id = z.string().max(64).parse(conversationId);
  await v.db
    .update(conversation)
    .set({ safetyPausedAt: null })
    .where(and(eq(conversation.userId, v.user.id), eq(conversation.id, id)));
  await updateProfile(v.db, v.user.id, { coachingPausedAt: null });
  refresh();
}
