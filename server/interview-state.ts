import "server-only";
import { z } from "zod";
import { intakeModel, freeTexts } from "@/domain/intake";
import {
  capturedThingSchema,
  weekDraftSchema,
  type WeekDraft,
} from "@/domain/week";
import { detectEatingConcern } from "@/domain/plan-menu";
import { pieceIssues } from "@/domain/piece-rules";
import type { RiskLevel } from "@/domain/safety";
import { open, seal } from "./crypto";
import { env } from "./env";
import { classifyRisk } from "./llm/talk";
import { recordSafetyEvent, updateProfile } from "./data/profile";
import { screen } from "./safety";
import type { Viewer } from "./viewer";
import { getUserModel } from "./data/intake";

const stateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  expires: z.number(),
  sequence: z.number().int().min(0),
  turns: z.number().int().min(1).max(10),
  phase: z.enum(["gathering", "confirming", "done"]),
  intake: intakeModel,
  things: z.array(capturedThingSchema).max(3),
  followups: z.number().int().min(0).max(2),
  words: z.array(z.string().max(1600)).max(3),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(6000),
      }),
    )
    .max(20),
  weekId: z.string().optional(),
  expectedVersion: z.number().int().positive().optional(),
  existingCount: z.number().int().min(0).max(3),
  proposed: weekDraftSchema.optional(),
});
export type InterviewState = z.infer<typeof stateSchema>;
// No words live here. Existing tokens resume after restart; replay protection is
// process-local until an instance is restarted. This matches the local app runtime.
const sequences = new Map<string, { n: number; expires: number }>();
export function packInterview(state: InterviewState) {
  const token = seal(JSON.stringify(stateSchema.parse(state)));
  for (const [id, entry] of sequences)
    if (entry.expires < Date.now()) sequences.delete(id);
  sequences.set(state.id, { n: state.sequence, expires: state.expires });
  return token;
}
export function readInterview(token: string, userId: string) {
  let state: InterviewState;
  try {
    state = stateSchema.parse(JSON.parse(open(token)));
  } catch {
    throw new Error("Open the interview again before continuing.");
  }
  if (
    state.userId !== userId ||
    state.expires < Date.now() ||
    (sequences.get(state.id)?.n ?? state.sequence) !== state.sequence
  )
    throw new Error("This interview changed. Open it again before continuing.");
  return state;
}
export function interviewTexts(draft: WeekDraft) {
  return draft.items
    .flatMap((i) => [
      ...Object.values(i.captured),
      ...i.pieces.flatMap((p) => [p.title, p.endpoint, p.when, p.sourcePhrase]),
    ])
    .filter((text): text is string => typeof text === "string");
}
/** No personal text, saved OR freshly supplied, reaches any model with memory off. */
export async function interviewSafety(
  v: Viewer,
  texts: string[],
): Promise<{ safety: RiskLevel; unavailable?: boolean }> {
  if (v.profile.coachingPausedAt) return { safety: "concern" };
  const rules = await screen(v.db, v.user.id, "interview", texts);
  if (rules !== "none") return { safety: rules };
  if (
    !v.profile.memoryOn ||
    env().KOE_AI === "off" ||
    !texts.some((t) => t.trim())
  )
    return { safety: "none" };
  const risk = await classifyRisk(
    [{ role: "user", content: texts.filter(Boolean).join("\n") }],
    v.user.id,
  );
  if (risk === null) return { safety: "none", unavailable: true };
  if (risk !== "none") {
    await recordSafetyEvent(v.db, v.user.id, {
      level: risk,
      source: "model",
      surface: "interview",
    });
    await updateProfile(v.db, v.user.id, { coachingPausedAt: new Date() });
  }
  return { safety: risk };
}
/** Validates edited words at the last server boundary; call before the outer transaction. */
export async function consumeInterviewApproval(
  v: Viewer,
  token: string,
  raw: unknown,
) {
  const state = readInterview(token, v.user.id);
  if (v.profile.coachingPausedAt || state.phase !== "done" || !state.proposed)
    throw new Error("Open the interview again before saving.");
  const draft = weekDraftSchema.parse(raw);
  // The person may edit/remove proposals, but cannot inject extra things/pieces.
  if (
    draft.items.length > state.proposed.items.length ||
    new Set(draft.items.map((i) => i.proposalId)).size !== draft.items.length ||
    draft.items.some((item) => {
      const original = state.proposed!.items.find(
        (candidate) =>
          !!item.proposalId && candidate.proposalId === item.proposalId,
      );
      return !original || item.pieces.length > original.pieces.length;
    })
  )
    throw new Error("Keep the proposed pieces or open another interview.");
  // Renaming keeps the person's original phrase available for piece provenance.
  for (const item of draft.items) {
    const original = state.proposed.items.find(
      (candidate) => candidate.proposalId === item.proposalId,
    )!;
    item.captured.originalWhat =
      original.captured.originalWhat ?? original.captured.what;
  }
  const words = [...freeTexts(state.intake), ...interviewTexts(draft)];
  const saved = await getUserModel(v.db, v.user.id);
  const eatingConcern =
    !!state.intake.eatingConcern ||
    !!saved?.model.eatingConcern ||
    words.some(detectEatingConcern);
  const gate = await interviewSafety(v, words);
  if (gate.safety !== "none" || gate.unavailable)
    return { ...gate, approval: null };
  const issues = draft.items.flatMap((item) => {
    const index = state.proposed!.items.findIndex(
      (original) => original.proposalId === item.proposalId,
    );
    return item.pieces.flatMap((piece) =>
      pieceIssues(
        piece,
        item.captured,
        eatingConcern,
        state.words[index] ?? "",
      ),
    );
  });
  if (issues.length)
    throw new Error("Check the words and sizes before saving.");
  return {
    ...gate,
    approval: {
      draft,
      today: v.today,
      eatingConcern,
      weekId: state.weekId,
      expectedVersion: state.expectedVersion,
      createId: state.id,
    },
  };
}
