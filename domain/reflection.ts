import { z } from "zod";
import {
  canRetrieveMemory,
  getSuggestionOptions,
  hasPlannerDraft,
  stepInput,
  type Action,
  type State,
  type Suggestion,
} from "./state";
import type { Energy } from "./tone";

export const memoryText = z
  .string()
  .trim()
  .min(1, "Write the card in your own words first.")
  .max(1000, "Use 1,000 characters or fewer.");
export const conversationWords = z
  .string()
  .trim()
  .max(1000, "Use 1,000 characters or fewer.");
export const journalText = z
  .string()
  .trim()
  .max(3000, "Use 3,000 characters or fewer.");
const journalInput = z.object({
  text: journalText,
  energy: z.enum(["unknown", "low", "steady", "more"]),
});
export const thoughtInput = z.object({
  situation: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  thought: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  feeling: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  alternative: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
});

type ActionsResult =
  { ok: true; actions: Action[] } | { ok: false; error: string };
type ApprovalResult =
  { ok: true; action: Action } | { ok: false; error: string };

export function approveMemory(
  state: State,
  text: string,
  source: string,
): ApprovalResult {
  if (state.temporary || !state.memoryConsent) {
    return {
      ok: false,
      error: "Memory cards are paused. Your words stay in the draft.",
    };
  }
  const parsed = memoryText.safeParse(text);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  return { ok: true, action: { type: "memoryAdd", text: parsed.data, source } };
}

export function conversationOption(
  state: State,
  consent: boolean,
): Suggestion | null {
  if (
    !consent ||
    !state.providerEnabled ||
    state.scenario === "coaching paused"
  )
    return null;
  return getSuggestionOptions(state)[0] ?? null;
}

export function conversationSuggestion(
  state: State,
  consent: boolean,
): string | null {
  return conversationOption(state, consent)?.title ?? null;
}

export function prepareConversationStep(
  state: State,
  consent: boolean,
  title: string,
  sourceMemoryId?: string,
): ApprovalResult {
  const option = conversationOption(state, consent);
  if (!option)
    return {
      ok: false,
      error: "A suggestion needs your permission and the script turned on.",
    };
  if (sourceMemoryId && !canRetrieveMemory(state, sourceMemoryId))
    return {
      ok: false,
      error:
        "The memory card behind this step was deleted or paused. Rewrite it in your own words, or use the current suggestion.",
    };
  const parsed = stepInput.safeParse({
    title,
    area: option.area,
    prediction: "",
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  return {
    ok: true,
    action: { type: "choose", ...parsed.data, sourceMemoryId },
  };
}

export function prepareReflectionStep(
  state: State,
  title: string,
  area: string,
): ActionsResult {
  if (hasPlannerDraft(state)) {
    return {
      ok: false,
      error:
        "A step draft is already open in the planner. Open it before starting another.",
    };
  }
  const parsed = stepInput.safeParse({ title, area, prediction: "" });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  return {
    ok: true,
    actions: [
      { type: "draft", key: "step.title", value: parsed.data.title },
      { type: "draft", key: "step.area", value: parsed.data.area },
    ],
  };
}

export function journalActions(text: string, energy: Energy): ActionsResult {
  const parsed = journalInput.safeParse({ text, energy });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!parsed.data.text && energy === "unknown")
    return {
      ok: false,
      error: "Nothing to add yet. Write a note or choose your energy.",
    };
  return {
    ok: true,
    actions: [
      {
        type: "journalAdd",
        text: parsed.data.text,
        energy: parsed.data.energy,
      },
      { type: "energy", value: energy },
      { type: "clearDraft", prefix: "journal.new." },
    ],
  };
}
