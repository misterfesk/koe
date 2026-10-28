import "server-only";
import { z } from "zod";
import { plainTextAsk } from "@/domain/chat-turn";
import {
  fallbackTurn,
  hardDayTurn,
  confirmingTurn,
  literalInterviewCapture,
  groundedCapture,
  interviewReplySchema,
  replyIsSafe,
  type InterviewHistory,
} from "@/domain/interview";
import { fallbackPieces, pieceIssues } from "@/domain/piece-rules";
import { pieceSchema, type CapturedThing } from "@/domain/week";
import { env } from "../env";
import { completeJson } from "./nebius";
import { breakdownSystem, system } from "./prompts/interview";

export type InterviewContext = {
  intake: unknown;
  eatingConcern: boolean;
  caring?: boolean;
  energy?: "low" | "okay" | "more";
  thing: CapturedThing;
  followups: number;
  turnsLeft: number;
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
  const fallback = /can['’]?t do anything|overwhelm/i.test(latest)
    ? hardDayTurn(context.thing, context.eatingConcern)
    : fallbackTurn(context.thing, context.followups);
  fallback.captured = { ...fallback.captured, ...literal };
  if (env().KOE_AI === "off")
    return { turn: fallback, source: "fallback" as const };
  const shape = interviewReplySchema.refine(
    (t) =>
      replyIsSafe(t, context.eatingConcern) &&
      groundedCapture(t.captured, words),
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
      context.followups >= 2 ||
      context.turnsLeft <= 0 ||
      turn.phase !== "gathering"
    )
      return {
        turn: { ...confirmingTurn(), captured: turn.captured },
        source: "ai" as const,
      };
    return {
      turn: { ...turn, ask: turn.ask ?? { ...plainTextAsk } },
      source: "ai" as const,
    };
  } catch {
    return { turn: fallback, source: "fallback" as const };
  }
}
export async function breakDown(context: InterviewContext, userId?: string) {
  const fallback = () => ({
    pieces: fallbackPieces(
      context.thing,
      context.eatingConcern,
      context.originalWords,
    ),
    source: "fallback" as const,
  });
  if (env().KOE_AI === "off") return fallback();
  const shape = z
    .object({ pieces: z.array(pieceSchema).min(3).max(6) })
    .superRefine((result, validation) => {
      const corrections: Record<string, string> = {
        availability:
          "Every piece must fit the person's stated available minutes.",
        destructive:
          "No destruction was requested. Propose sorting and keeping instead.",
        unrelated_message:
          "Unsent messages are only for contact work, not this thing.",
        source: "Copy sourcePhrase exactly from a captured field.",
        words:
          "Use safe plain second-person words without banned phrases or excluded subjects.",
        contact: "Use an unsent draft. Sending requires an explicit request.",
        size: "Minutes must fit tiny <=5, small <=15, medium <=25.",
      };
      result.pieces.forEach((piece, index) => {
        const issues = pieceIssues(
          piece,
          context.thing,
          context.eatingConcern,
          context.originalWords,
        );
        if (context.caring && piece.size === "medium")
          issues.push("availability");
        for (const issue of issues)
          validation.addIssue({
            code: "custom",
            path: ["pieces", index],
            message:
              corrections[issue] ??
              "Check this piece against the supplied rules.",
          });
      });
    });
  try {
    const result = await completeJson(
      [
        { role: "system", content: breakdownSystem },
        { role: "user", content: JSON.stringify(boundedContext(context)) },
      ],
      shape,
      {
        purpose: "interview_breakdown",
        userId,
        model: env().KOE_CHAT_MODEL,
        schemaName: "interview_breakdown",
        maxTokens: 1800,
        temperature: 0.3,
      },
    );
    return { ...result, source: "ai" as const };
  } catch {
    return fallback();
  }
}
