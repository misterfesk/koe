"use server";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RiskLevel } from "@/domain/safety";
import {
  clockToMinutes,
  resultLines,
  toolSchemas,
  vetCall,
  type ToolProposal,
} from "@/domain/talk-tools";
import { conversation, talkModes } from "../db/schema";
import { recordSafetyEvent, updateProfile } from "../data/profile";
import { addMemory } from "../data/memory";
import {
  addMessage,
  countUserMessagesSince,
  deleteConversation,
  getConversation,
  getMessage,
  listConversations,
  purgeOldConversations,
  setConversationPaused,
  startConversation,
  updateTool,
} from "../data/talk";
import { env } from "../env";
import { AiUnavailable } from "../llm/nebius";
import { planToday } from "../llm/planner";
import { classifyRisk, reply } from "../llm/talk";
import { buildTalkContext } from "../llm/talk-context";
import { talkStubbed } from "../llm/talk-stub";
import { addToToday, moveItemTo } from "../plan-edit";
import { screen } from "../safety";
import { requireViewer, type Viewer } from "../viewer";
import { formatClock, localDay, readableDay, uses12Hour } from "@/domain/time";
import { talkScreenState } from "../talk-page";
import { remindMe, turnOnMorningPlan } from "./settings";
import { refreshShelfFor } from "../search/shelf";

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
        "You've talked a lot with Koe today, so chat is resting until tomorrow. Your day and Help still work.",
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

  // The scripted stand-in (tests only) replaces the model, not the checks.
  if (env().KOE_AI === "off" && !talkStubbed()) {
    refresh();
    return { ok: true, conversationId: id, safety: "none", unavailable: true };
  }

  convo = await getConversation(v.db, v.user.id, id);
  const history = convo!.messages;

  // Layer 2 (model check) runs alongside the reply to save time. A reply is
  // only shown if the check comes back clear: an error or timeout counts as
  // not cleared, so Koe says it can't reply rather than risk a normal answer.
  const chat = history.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
  const [risk, answer] = await Promise.all([
    classifyRisk(chat, v.user.id),
    buildTalkContext(v, history.filter((m) => m.role === "user").length).then(
      (context) =>
        reply(convo!.mode, history, context, v.user.id).catch(
          (error: unknown) => {
            if (error instanceof AiUnavailable) return null;
            throw error;
          },
        ),
    ),
  ]);

  if (risk && risk !== "none") {
    await recordSafetyEvent(v.db, v.user.id, {
      level: risk,
      source: "model",
      surface: "talk",
    });
    await updateProfile(v.db, v.user.id, { coachingPausedAt: new Date() });
    // Whatever the model proposed with its reply is thrown away with it.
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

// --- Cards ------------------------------------------------------------------------

const cardIds = z.object({
  messageId: z.string().min(1).max(64),
  proposalId: z.string().min(1).max(64),
});

const confirmInput = z
  .object({
    /** The person's edit of a memory card. */
    text: z.string().trim().max(200).optional(),
    /** How a draft was taken: copied, or opened in messages or email. */
    via: z.enum(["copy", "sms", "email"]).optional(),
  })
  .optional();

export type CardResult =
  { ok: true; result: string } | { ok: false; error: string };

const memoryText = z
  .string()
  .trim()
  .min(3, "Write a few words, or choose No thanks.")
  .max(200, "Use 200 characters or fewer.");

/** What a card says while it is being carried out. */
const WORKING = "Working on it.";

const NO_LONGER_FITS =
  "That doesn't fit your day any more. You can ask Koe again.";

type Done = { ok: true; result: string } | { ok: false; error: string };

/** The person's clock, so a result line reads like the card: "5:00 pm" or "17:00". */
async function clockFor() {
  let hour12 = false;
  try {
    hour12 = uses12Hour((await headers()).get("accept-language"));
  } catch {
    // Outside a request there is no locale: 24-hour.
  }
  return (minutes: number) => formatClock(minutes, hour12);
}

/** Runs what a confirmed card stands for, through the same actions as the rest of the app. */
async function run(
  v: Viewer,
  conversationId: string,
  tool: ToolProposal,
  extra: z.output<typeof confirmInput>,
): Promise<Done> {
  const a = tool.args;
  const clock = await clockFor();
  // Today's plan may have changed since the card was made: check it again.
  if (
    ["add_item", "move_item", "shrink_item", "set_reminder"].includes(tool.name)
  ) {
    const { vet } = await buildTalkContext(v, 0);
    if (!vetCall(tool.name, a, vet))
      return { ok: false, error: NO_LONGER_FITS };
  }
  switch (tool.name) {
    case "add_item": {
      const x = toolSchemas.add_item.parse(a);
      const r = await addToToday(v, {
        kind: x.kind,
        title: x.title,
        why: x.why || "You asked for this in Talk",
        size: x.size,
        minute: x.minuteOfDay,
        origin: "talk",
      });
      if (!r.ok) return { ok: false, error: r.error };
      return r.changed
        ? { ok: true, result: resultLines.add_item() }
        : { ok: false, error: r.note };
    }
    case "move_item": {
      const minute = Number(a.minuteOfDay);
      const r = await moveItemTo(v, String(a.itemId), minute);
      if (!r.ok) return { ok: false, error: r.error };
      return r.changed
        ? { ok: true, result: resultLines.move_item(clock(minute)) }
        : { ok: false, error: r.note };
    }
    case "shrink_item": {
      const r = await planToday(
        v.user.id,
        {
          reason: "not_today_shrink",
          itemId: String(a.itemId),
          title:
            typeof a.smallerTitle === "string" ? a.smallerTitle : undefined,
        },
        { db: v.db, today: v.today },
      );
      return r.changed
        ? { ok: true, result: resultLines.shrink_item() }
        : { ok: false, error: r.note };
    }
    case "set_reminder": {
      if (typeof a.morningPlan === "string") {
        const r = await turnOnMorningPlan({
          minuteOfDay: clockToMinutes(a.morningPlan),
        });
        return r.ok
          ? {
              ok: true,
              result: resultLines.reminderMorning(
                clock(clockToMinutes(a.morningPlan)),
              ),
            }
          : { ok: false, error: r.error ?? "Couldn't set that reminder." };
      }
      const r = await remindMe({ stepId: String(a.itemId) });
      return r.ok && r.minuteOfDay !== undefined
        ? { ok: true, result: resultLines.reminderItem(clock(r.minuteOfDay)) }
        : { ok: false, error: r.error ?? "Couldn't set that reminder." };
    }
    case "save_memory": {
      if (!v.profile.memoryOn)
        return {
          ok: false,
          error: "Memory is off. You can turn it on in You.",
        };
      const text = memoryText.safeParse(extra?.text ?? a.text);
      if (!text.success)
        return { ok: false, error: text.error.issues[0].message };
      // The person's own edit is kept as they wrote it; the safety rules still read it.
      await addMemory(v.db, v.user.id, {
        kind: toolSchemas.save_memory.parse(a).kind,
        text: text.data,
        source: "talk",
        sourceRef: conversationId,
      });
      await screen(v.db, v.user.id, "memory", [text.data]);
      return { ok: true, result: resultLines.save_memory() };
    }
    case "find_resources": {
      const tags = toolSchemas.find_resources.parse(a);
      const found = await refreshShelfFor(
        v,
        tags,
        `${conversationId}:${tool.id}`,
      );
      return found.ok
        ? { ok: true, result: resultLines.find_resources(found.count) }
        : {
            ok: false,
            error: "Search is unavailable. Try again later from your Shelf.",
          };
    }
    case "draft_message":
      return {
        ok: true,
        result:
          extra?.via === "sms"
            ? resultLines.draftSms()
            : extra?.via === "email"
              ? resultLines.draftEmail()
              : resultLines.draftCopied(),
      };
    case "prepare_appointment":
      return { ok: true, result: resultLines.prepare_appointment() };
  }
}

/**
 * The person confirmed a card. Runs the matching action once: a second
 * confirm (a double tap, two tabs) returns the same result line and changes
 * nothing. A card that can't be carried out goes back to waiting.
 */
export async function confirmProposal(
  messageId: string,
  proposalId: string,
  extra?: z.input<typeof confirmInput>,
): Promise<CardResult> {
  const v = await requireViewer();
  // While coaching is paused after a safety check, nothing from Talk runs.
  if (v.profile.coachingPausedAt)
    return {
      ok: false,
      error: "This is on hold for now. Help is at the top of the screen.",
    };
  const ids = cardIds.safeParse({ messageId, proposalId });
  const more = confirmInput.safeParse(extra);
  if (!ids.success || !more.success)
    return { ok: false, error: "That card is gone." };
  const stored = (
    await getMessage(v.db, v.user.id, ids.data.messageId)
  )?.proposals?.tools.find((t) => t.id === ids.data.proposalId);
  // A process interrupted during search can retry its durable request key.
  if (
    stored?.name === "find_resources" &&
    stored.status === "done" &&
    stored.result === WORKING &&
    (!stored.startedAt || Date.parse(stored.startedAt) < Date.now() - 120_000)
  )
    await updateTool(
      v.db,
      v.user.id,
      ids.data.messageId,
      ids.data.proposalId,
      "done",
      { status: "pending", result: undefined, startedAt: undefined },
    );
  const mine = await updateTool(
    v.db,
    v.user.id,
    ids.data.messageId,
    ids.data.proposalId,
    "pending",
    { status: "done", result: WORKING, startedAt: new Date().toISOString() },
  );
  if (!mine.ok) {
    let t: ToolProposal | null | undefined = mine.tool;
    if (!t) return { ok: false, error: "That card is gone." };
    // Someone else (a second tap, another tab) is carrying it out: wait for the outcome.
    for (
      let i = 0;
      i < 40 && t?.status === "done" && t.result === WORKING;
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
      t = (
        await getMessage(v.db, v.user.id, ids.data.messageId)
      )?.proposals?.tools.find((x) => x.id === ids.data.proposalId);
    }
    if (!t) return { ok: false, error: "That card is gone." };
    if (t.status === "done" && t.result === WORKING)
      return {
        ok: false,
        error: "Still looking. Open your Shelf in a moment.",
      };
    if (t.status === "done") return { ok: true, result: t.result ?? "Done." };
    if (t.status === "pending")
      return { ok: false, error: "That didn't go through. Try again." };
    return { ok: false, error: "You already said no to this one." };
  }
  const convo =
    (await getMessage(v.db, v.user.id, ids.data.messageId))?.conversationId ??
    "";
  let done: Done;
  try {
    done = await run(v, convo, mine.tool, more.data);
  } catch {
    done = { ok: false, error: "Something went wrong. Try again in a moment." };
  }
  if (!done.ok) {
    // Nothing happened, so the card goes back to waiting.
    await updateTool(
      v.db,
      v.user.id,
      ids.data.messageId,
      ids.data.proposalId,
      "done",
      {
        status: "pending",
        result: undefined,
        startedAt: undefined,
      },
    );
    refresh();
    return done;
  }
  await updateTool(
    v.db,
    v.user.id,
    ids.data.messageId,
    ids.data.proposalId,
    "done",
    {
      result: done.result,
      startedAt: undefined,
    },
  );
  refresh();
  return done;
}

/** The person said no to a card. Nothing is written except that the card is answered. */
export async function dismissProposal(
  messageId: string,
  proposalId: string,
): Promise<{ ok: boolean }> {
  const v = await requireViewer();
  const ids = cardIds.safeParse({ messageId, proposalId });
  if (!ids.success) return { ok: false };
  const r = await updateTool(
    v.db,
    v.user.id,
    ids.data.messageId,
    ids.data.proposalId,
    "pending",
    { status: "dismissed" },
  );
  refresh();
  return { ok: r.ok || r.tool?.status === "dismissed" };
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

/**
 * One conversation (or an empty one for null) with what the Talk screen needs,
 * for the side panel. Another person's id gives nothing.
 */
export async function loadConversation(id: string | null) {
  const v = await requireViewer();
  const screen = await talkScreenState(v);
  const base = { region: v.profile.region, ...screen };
  const paused = !!v.profile.coachingPausedAt;
  if (id === null)
    return {
      ok: true as const,
      id: null,
      mode: "talk" as const,
      messages: [],
      paused,
      ...base,
    };
  const convo = await getConversation(
    v.db,
    v.user.id,
    z.string().max(64).parse(id),
  );
  if (!convo) return { ok: false as const };
  return {
    ok: true as const,
    id: convo.id,
    mode: convo.mode,
    messages: convo.messages,
    paused: convo.safetyPaused || paused,
    ...base,
  };
}

/** The 8 newest conversations `/talk` lists, with a readable date for each. */
export async function listTalkHistory() {
  const v = await requireViewer();
  if (!v.profile.keepTranscripts) await purgeOldConversations(v.db, v.user.id);
  const talks = await listConversations(v.db, v.user.id, 8);
  return talks.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt,
    when: readableDay(
      localDay(v.profile.timezone, new Date(t.updatedAt)),
      v.today,
    ),
  }));
}
