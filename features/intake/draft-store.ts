import { dayKinds, goals, lifts, wakes } from "@/domain/intake";
import type { DayKind, Goal, Lift, IntakeInput, Wake } from "@/domain/intake";
import { detectEatingConcern } from "@/domain/plan-menu";
import { detectRisk } from "@/domain/safety";

const KEY = "koe.intake.draft.v1";
const unsafe = (text: string) =>
  detectRisk(text) !== "none" || detectEatingConcern(text);
export type IntakeDraft = {
  goals: Goal[];
  goalsNote: string;
  days: DayKind[];
  wake: Wake[];
  dayNote: string;
  wakeNote: string;
  lifts: Lift[];
  liftsNote: string;
  puttingOff: string;
  eatingConcern: boolean;
};
export type IntakeStage = "intro" | 1 | 2 | 3 | 4;
export type StoredDraft = {
  version: 2;
  stage: IntakeStage;
  draft: IntakeDraft;
  notice?: string;
};
export const blankDraft = (): IntakeDraft => ({
  goals: [],
  goalsNote: "",
  days: [],
  wake: [],
  dayNote: "",
  wakeNote: "",
  lifts: [],
  liftsNote: "",
  puttingOff: "",
  eatingConcern: false,
});
const textFields = [
  "goalsNote",
  "dayNote",
  "wakeNote",
  "liftsNote",
  "puttingOff",
] as const;
export const dayAnswer = (draft: Pick<IntakeDraft, "dayNote" | "wakeNote">) =>
  [draft.dayNote, draft.wakeNote && `Wake: ${draft.wakeNote}`]
    .filter(Boolean)
    .join(". ");
export const noteLimit = (
  draft: Pick<IntakeDraft, "dayNote" | "wakeNote">,
  key: "dayNote" | "wakeNote",
) =>
  Math.max(
    0,
    key === "dayNote"
      ? 200 - (draft.wakeNote ? draft.wakeNote.length + 8 : 0)
      : 200 - (draft.dayNote ? draft.dayNote.length + 8 : 6),
  );

/** Whitelist every stored field, including legacy drafts. Hidden answers never return. */
export function normalizeDraft(value: unknown): IntakeDraft {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const picks = <T extends string>(
    key: string,
    allowed: readonly T[],
    max: number,
  ): T[] =>
    Array.isArray(raw[key])
      ? [
          ...new Set(
            raw[key].filter(
              (v): v is T => typeof v === "string" && allowed.includes(v as T),
            ),
          ),
        ].slice(0, max)
      : [];
  const draft = blankDraft();
  draft.goals = picks("goals", goals, 2);
  draft.days = picks("days", dayKinds, 1);
  draft.wake = picks("wake", wakes, 1);
  draft.lifts = picks(
    "lifts",
    lifts.filter((v) => v !== "other"),
    10,
  );
  draft.eatingConcern = raw.eatingConcern === true;
  for (const field of textFields) {
    const text = typeof raw[field] === "string" ? raw[field].slice(0, 200) : "";
    draft[field] = text;
  }
  draft.wakeNote = draft.wakeNote.slice(0, noteLimit(draft, "wakeNote"));
  return draft;
}

/** Unsafe words never persist. The existing eating flag keeps planning protections. */
export function storable(draft: IntakeDraft): IntakeDraft {
  const out = normalizeDraft(draft);
  for (const field of textFields) {
    if (detectEatingConcern(out[field])) out.eatingConcern = true;
    if (unsafe(out[field])) out[field] = "";
  }
  return out;
}
export function toModel(draft: IntakeDraft): IntakeInput {
  return {
    goals: draft.goals,
    days: draft.days[0],
    wake: draft.wake[0],
    puttingOff: draft.puttingOff,
    lifts: draft.lifts,
    people: [],
    names: [],
    tone: "calm",
    eatingConcern: draft.eatingConcern,
    notes: {
      goals: draft.goalsNote,
      day: dayAnswer(draft),
      lifts: draft.liftsNote,
    },
  };
}
export function loadDraft(): StoredDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.draft ||
      typeof parsed.draft !== "object" ||
      Array.isArray(parsed.draft)
    )
      return null;
    const stage = parsed.stage;
    if (
      stage !== "intro" &&
      (!Number.isInteger(stage) || stage < 1 || stage > 5)
    )
      return null;
    const shortened =
      typeof parsed.draft.dayNote === "string" &&
      typeof parsed.draft.wakeNote === "string" &&
      dayAnswer(parsed.draft).length > 200;
    return {
      version: 2,
      stage: shortened ? 2 : stage === 5 ? 4 : stage,
      draft: storable(normalizeDraft(parsed.draft)),
      ...(shortened
        ? {
            notice:
              "Your day answers were shortened. Check them before moving on.",
          }
        : {}),
    };
  } catch {
    return null;
  }
}
export function saveDraft(value: StoredDraft) {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...value, draft: storable(value.draft) }),
    );
  } catch {
    /* Blocked storage does not prevent intake. */
  }
}
export function clearDraft() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
