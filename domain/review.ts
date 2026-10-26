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
        "Write the smaller version in 240 characters or fewer, or choose something else.",
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
          ? "Saved. The step is on Today."
          : "Saved. The smaller version is on Today, and your earlier reports are kept.",
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
        ? "The old step and its reminder preview are paused."
        : "The step and its reminder preview are paused.",
  };
}
