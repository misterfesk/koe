import type { Action, Step } from "./state";

export type ReviewChoice = "continue" | "shrink" | "switch" | "support";
export type ReviewChange =
  | { ok: true; actions: Action[]; route?: string; message: string }
  | { ok: false; message: string };

/** Plan changes are explicit choices. Reflections never infer a treatment or outcome. */
export function reviewActions(
  step: Step,
  choice: ReviewChoice,
  adjustment: string,
): ReviewChange {
  if (
    choice === "shrink" &&
    (!adjustment.trim() || adjustment.trim().length > 240)
  ) {
    return {
      ok: false,
      message:
        "Write an adjusted step using 1 to 240 characters, or choose another approach.",
    };
  }
  const actions: Action[] = [];
  if (choice === "continue" || choice === "shrink") {
    if (step.paused) actions.push({ type: "pauseStep", id: step.id });
    actions.push({ type: "active", id: step.id });
    if (choice === "shrink") {
      actions.push(
        { type: "propose", id: step.id, title: adjustment.trim() },
        { type: "acceptAdjustment", id: step.id },
      );
    }
    return {
      ok: true,
      actions,
      message:
        choice === "continue"
          ? "Review applied. Your selected step is on Today."
          : "Review applied. Your edited step is now the next version; earlier reports are unchanged.",
    };
  }
  if (!step.paused) actions.push({ type: "pauseStep", id: step.id });
  actions.push({ type: "decline" });
  return {
    ok: true,
    actions,
    route: choice === "switch" ? "/steps/new" : "/help",
    message:
      choice === "switch"
        ? "The previous step is paused while you choose another. Its reminder preview is paused too."
        : "The previous step and its reminder preview are paused. Human support remains your choice.",
  };
}
