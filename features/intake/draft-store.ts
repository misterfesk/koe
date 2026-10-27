import { detectEatingConcern } from "@/domain/plan-menu";
import { detectRisk } from "@/domain/safety";

const unsafe = (text: string) =>
  detectRisk(text) !== "none" || detectEatingConcern(text);

// The in-progress intake lives in sessionStorage so a reload resumes where the
// person was. It is a convenience only: every read and write is wrapped, and
// the intake works the same without it. Closing the tab clears it.

const KEY = "koe.intake.draft.v1";

export type StoredDraft<D> = { stage: "intro" | 1 | 2 | 3 | 4 | 5; draft: D };

const textFields = [
  "goalsNote",
  "puttingOff",
  "dayNote",
  "liftsNote",
  "peopleNote",
] as const;

/**
 * A copy that is safe to keep: typed words that trip the safety rules (or the
 * food and weight check) are dropped (they are never stored), and so are names, which are free text too.
 */
export function storable<
  D extends Record<(typeof textFields)[number], string> & {
    names: { name: string; save: boolean }[];
  },
>(draft: D): D {
  const out: D = { ...draft };
  for (const f of textFields)
    if (unsafe(out[f])) (out as Record<string, unknown>)[f] = "";
  out.names = draft.names.map((n) =>
    unsafe(n.name) ? { name: "", save: false } : n,
  );
  return out;
}

export function loadDraft<D>(): StoredDraft<D> | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<D>;
    const ok =
      parsed &&
      typeof parsed === "object" &&
      parsed.draft &&
      (parsed.stage === "intro" ||
        (typeof parsed.stage === "number" &&
          parsed.stage >= 1 &&
          parsed.stage <= 5));
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft<D>(value: StoredDraft<D>) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: carry on without it.
  }
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
