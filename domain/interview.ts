import { z } from "zod";
import { chatTurnSchema, type ChatTurn } from "./chat-turn";
import { fallbackPieces, safeInterviewText } from "./piece-rules";
import { capturedThingSchema, type CapturedThing } from "./week";

export const interviewReplySchema = chatTurnSchema.extend({
  phase: z.enum(["gathering", "confirming", "done"]),
  captured: capturedThingSchema.partial(),
});
export type InterviewReply = z.infer<typeof interviewReplySchema>;
export type InterviewHistory = {
  role: "user" | "assistant";
  content: string;
}[];
export function replyIsSafe(turn: ChatTurn, eatingConcern = false) {
  return [
    turn.message,
    turn.ask?.placeholder,
    turn.ask?.info,
    ...(turn.ask?.options ?? []).map((o) => o.label),
  ]
    .filter((s): s is string => !!s)
    .every((s) => safeInterviewText(s, eatingConcern));
}
export function groundedCapture(
  captured: Partial<CapturedThing>,
  words: string,
) {
  return Object.values(captured).every(
    (value) => !value || words.includes(value),
  );
}
/** Explicit words remain facts even when the model cannot produce a checked turn. */
export function literalInterviewCapture(
  words: string,
  eatingConcern = false,
): Partial<CapturedThing> {
  const captured: Partial<CapturedThing> = {};
  const deadline = [
    ...words.matchAll(
      /\b(?:due|by|before|until|on)\s+(?:(?:this|next)\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    ),
  ].at(-1)?.[0];
  if (deadline) captured.when = deadline;
  for (const line of words.split("\n")) {
    const replacement = line.match(/^(.+?)\s+instead[.!?]?$/i)?.[1];
    if (replacement && safeInterviewText(replacement, eatingConcern))
      captured.what = replacement;
  }
  return captured;
}
export function confirmingTurn(): InterviewReply {
  return {
    message: "Want to break this into pieces for the week?",
    phase: "confirming",
    captured: {},
    ask: {
      kind: "single",
      allowOther: false,
      options: [
        { id: "propose", label: "Break it down" },
        { id: "add", label: "Add another thing" },
        { id: "finish", label: "That's enough for now" },
      ],
    },
  };
}
export function openingTurn(): InterviewReply {
  return {
    message: "Tell me about something you'd like to get done this week.",
    phase: "gathering",
    captured: {},
    ask: {
      kind: "text",
      allowOther: false,
      placeholder: "e.g. Updating my CV. I open it, then close it again.",
      info: "Koe uses your words to suggest smaller pieces. A few words are enough.",
    },
  };
}
export function hardDayTurn(
  thing: CapturedThing,
  eatingConcern = false,
): InterviewReply {
  const piece = fallbackPieces(thing, eatingConcern)[0];
  return {
    message: "Today can be smaller. What would you like to keep?",
    phase: "confirming",
    captured: {},
    ask: {
      kind: "single",
      allowOther: false,
      options: [
        ...(piece ? [{ id: "propose", label: piece.title }] : []),
        { id: "finish", label: "No plan today" },
      ],
    },
  };
}
export function fallbackTurn(
  thing: CapturedThing,
  followups: number,
): InterviewReply {
  if (followups >= 2) return confirmingTurn();
  return {
    message: /everything|don't know|get my life together|sleep better/i.test(
      thing.what,
    )
      ? "What would that look like this week?"
      : followups === 0
        ? "Where does it get stuck?"
        : "What would finishing look like this week?",
    phase: "gathering",
    captured: {},
    ask: {
      kind: "text",
      allowOther: false,
      placeholder:
        followups === 0
          ? "e.g. Only the opening paragraph. Choosing the words feels hard."
          : "e.g. Your notes are ready. Friday would work.",
    },
  };
}
