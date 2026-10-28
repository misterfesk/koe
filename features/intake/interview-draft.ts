import { z } from "zod";
import { interviewReplySchema, replyIsSafe } from "@/domain/interview";
import { weekDraftSchema } from "@/domain/week";
import { detectRisk } from "@/domain/safety";
import { detectEatingConcern } from "@/domain/plan-menu";

const schema = z.object({
  token: z.string().min(1).max(100_000),
  turn: interviewReplySchema.nullable(),
  draft: weekDraftSchema.optional(),
  answer: z.string().max(400).default(""),
  messages: z
    .array(
      z.object({
        id: z.string().max(80),
        role: z.enum(["user", "assistant"]),
        text: z.string().max(6000),
      }),
    )
    .max(20),
});
export type InterviewDraft = z.infer<typeof schema>;
export const interviewKey = (owner: string, mode: "intro" | "return") =>
  `koe.plan-draft:interview:${owner}:${mode}`;
const unsafe = (text: string) =>
  detectRisk(text) !== "none" || detectEatingConcern(text);
export function readInterviewDraft(
  owner: string,
  mode: "intro" | "return",
): InterviewDraft | null {
  try {
    const parsed = schema.safeParse(
      JSON.parse(sessionStorage.getItem(interviewKey(owner, mode)) ?? "null"),
    );
    if (!parsed.success) return null;
    const value = parsed.data;
    if (value.turn && !replyIsSafe(value.turn)) return null;
    if (value.draft && unsafe(JSON.stringify(value.draft))) return null;
    return {
      ...value,
      answer: unsafe(value.answer) ? "" : value.answer,
      messages: value.messages.filter((m) => !unsafe(m.text)),
    };
  } catch {
    return null;
  }
}
export function writeInterviewDraft(
  owner: string,
  mode: "intro" | "return",
  value: InterviewDraft,
) {
  try {
    if (value.turn && !replyIsSafe(value.turn)) return;
    const safe = {
      ...value,
      answer: unsafe(value.answer) ? "" : value.answer,
      messages: value.messages.filter((m) => !unsafe(m.text)),
    };
    if (safe.draft && unsafe(JSON.stringify(safe.draft))) delete safe.draft;
    sessionStorage.setItem(
      interviewKey(owner, mode),
      JSON.stringify(schema.parse(safe)),
    );
  } catch {
    /* Storage can be blocked. */
  }
}
export function clearInterviewDraft(owner: string, mode: "intro" | "return") {
  try {
    sessionStorage.removeItem(interviewKey(owner, mode));
  } catch {
    /* Storage can be blocked. */
  }
}
