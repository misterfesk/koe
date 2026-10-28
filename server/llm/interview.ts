import "server-only";
import { plainTextAsk } from "@/domain/chat-turn";
import {
  confirmingTurn,
  fallbackTurn,
  groundedCapture,
  HARD_DAY,
  hardDayTurn,
  interviewReplySchema,
  literalInterviewCapture,
  replyIsSafe,
  type InterviewHistory,
} from "@/domain/interview";
import type { CapturedThing } from "@/domain/week";
import { asksForMore, samplePlaceholder } from "@/domain/interview-text";
import { env } from "../env";
import { completeJson } from "./nebius";
import { system } from "./prompts/interview";

export type InterviewContext = {
  intake: unknown;
  eatingConcern: boolean;
  caring?: boolean;
  energy?: "low" | "okay" | "more";
  thing: CapturedThing;
  followups: number;
  turnsLeft: number;
  /** Whether a confirming turn may still offer "Add another". */
  canAdd?: boolean;
  /** Read-only owner-checked answers for this thing; never persisted as model memory. */
  originalWords?: string;
};
function boundedContext(context: InterviewContext) {
  const intake =
    context.intake && typeof context.intake === "object"
      ? (context.intake as Record<string, unknown>)
      : {};
  return {
    originalWords: (context.originalWords ?? "").slice(0, 1600),
    eatingConcern: context.eatingConcern,
    caring: context.caring,
    thing: context.thing,
    followups: context.followups,
    turnsLeft: context.turnsLeft,
    energy: context.energy,
    intake: Object.fromEntries(
      ["goals", "lifts", "days", "wake"].map((key) => [key, intake[key]]),
    ),
  };
}
export async function interviewTurn(
  history: InterviewHistory,
  context: InterviewContext,
  userId?: string,
) {
  const latest = history.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const words = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const literal = literalInterviewCapture(
    context.originalWords ?? words,
    context.eatingConcern,
  );
  const fallback = HARD_DAY.test(latest)
    ? hardDayTurn(true)
    : fallbackTurn(context.thing, context.followups, context.canAdd);
  fallback.captured = { ...fallback.captured, ...literal };
  if (env().KOE_AI === "off")
    return { turn: fallback, source: "fallback" as const };
  const shape = interviewReplySchema.refine(
    (t) =>
      replyIsSafe(t, context.eatingConcern) &&
      groundedCapture(t.captured, words),
    {
      message:
        "Use plain words with no AI tells, and copy what and when exactly from the person's words.",
    },
  );
  try {
    const turn = await completeJson(
      [
        { role: "system", content: system(boundedContext(context)) },
        ...history.slice(-12).map((m) => ({
          ...m,
          content: m.content.slice(0, m.role === "user" ? 400 : 280),
        })),
      ],
      shape,
      {
        purpose: "interview_turn",
        userId,
        model: env().KOE_CHAT_MODEL,
        schemaName: "interview_turn",
        maxTokens: 900,
        temperature: 0.3,
      },
    );
    turn.captured = { ...turn.captured, ...literal };
    if (
      context.followups >= 1 ||
      context.turnsLeft <= 1 ||
      turn.phase !== "gathering" ||
      // Only the server asks whether there is more.
      asksForMore.test(turn.message)
    )
      return {
        turn: { ...confirmingTurn(context.canAdd), captured: turn.captured },
        source: "ai" as const,
      };
    const ask = turn.ask ?? { ...plainTextAsk };
    return {
      turn: {
        ...turn,
        ask: {
          ...ask,
          ...(ask.placeholder !== undefined || ask.kind === "text"
            ? { placeholder: samplePlaceholder(ask.placeholder) }
            : {}),
        },
      },
      source: "ai" as const,
    };
  } catch {
    return { turn: fallback, source: "fallback" as const };
  }
}
