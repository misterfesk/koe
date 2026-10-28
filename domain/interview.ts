import { z } from "zod";
import { chatTurnSchema, type ChatTurn } from "./chat-turn";
import { safeInterviewText } from "./interview-text";
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
/** At most this many Koe turns per interview, opening and confirming included. */
export const MAX_TURNS = 7;
export const MAX_THINGS = 3;
export const WHEN_QUESTION = "When does it need to be done?";
export const NO_DEADLINE = "No deadline";
export const HARD_DAY = /can['’]?t do anything|overwhelm/i;
export function replyIsSafe(
  turn: ChatTurn & { captured?: Partial<CapturedThing> },
  eatingConcern = false,
) {
  return [
    turn.message,
    turn.ask?.placeholder,
    turn.ask?.info,
    turn.captured?.title,
    ...(turn.ask?.options ?? []).map((o) => o.label),
  ]
    .filter((s): s is string => !!s)
    .every((s) => safeInterviewText(s, eatingConcern));
}
/** `what` and `when` must be the person's own words; `title` may rephrase them. */
export function groundedCapture(
  captured: Partial<CapturedThing>,
  words: string,
) {
  return [captured.what, captured.when].every(
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
/** The answer to the fixed deadline question; "No deadline" leaves it empty. */
export function whenFromAnswer(text: string) {
  return text.trim() === NO_DEADLINE ? "" : text.trim().slice(0, 200);
}
const TIME_WORDS =
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day|\b(?:today|tonight|tomorrow|week|weekend|month|morning|afternoon|evening|night|noon|midnight|soon|asap|deadline|end of|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d/i;
/** A deadline is kept only when it reads like a time; other words stay out of "By …". */
export function looksLikeWhen(text: string) {
  return TIME_WORDS.test(text);
}
export function openingTurn(): InterviewReply {
  return {
    message: "What's one thing you'd like to get done this week?",
    phase: "gathering",
    captured: {},
    ask: {
      kind: "text",
      allowOther: false,
      placeholder: "e.g. Update my CV",
    },
  };
}
export function followUpTurn(): InterviewReply {
  return {
    message: WHEN_QUESTION,
    phase: "gathering",
    captured: {},
    ask: {
      kind: "single",
      allowOther: true,
      placeholder: "e.g. Friday",
      options: [
        { id: "this-week", label: "This week" },
        { id: "weekend", label: "By the weekend" },
        { id: "none", label: NO_DEADLINE },
      ],
    },
  };
}
export function confirmingTurn(canAdd = true): InterviewReply {
  return {
    message: "Anything else you'd like to get done this week?",
    phase: "confirming",
    captured: {},
    ask: {
      kind: "single",
      allowOther: false,
      options: [
        ...(canAdd ? [{ id: "add", label: "Add another" }] : []),
        { id: "finish", label: "That's enough for now" },
      ],
    },
  };
}
export function hardDayTurn(hasThing: boolean): InterviewReply {
  return {
    message: "Heavy day. Today can be really small.",
    phase: "confirming",
    captured: {},
    ask: {
      kind: "single",
      allowOther: false,
      options: [
        ...(hasThing ? [{ id: "finish", label: "Add it to my week" }] : []),
        { id: "skip", label: "No plan today" },
      ],
    },
  };
}
/** Fixed turns when the model is off or fails: ask the deadline once, then confirm. */
export function fallbackTurn(
  thing: CapturedThing,
  followups: number,
  canAdd = true,
): InterviewReply {
  return followups === 0 && !thing.when
    ? followUpTurn()
    : confirmingTurn(canAdd);
}
