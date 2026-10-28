import { z } from "zod";
import { freeTexts, intakeModel, type IntakeModel } from "./intake";
import { detectEatingConcern } from "./plan-menu";

// Derived flags never come from a browser. Intro preferences are historical;
// active tone and reminders remain in profile/reminder.
export const modelEdit = z
  .object({
    version: z.number().int().min(0),
    summary: z.string().trim().max(400),
    model: intakeModel.omit({ eatingConcern: true }).strict(),
  })
  .strict();

export function editedModel(
  input: z.output<typeof modelEdit>["model"],
  previous?: IntakeModel,
  summary = "",
): IntakeModel {
  return {
    ...input,
    eatingConcern:
      !!previous?.eatingConcern ||
      [summary, ...freeTexts({ ...input, eatingConcern: false })].some(
        detectEatingConcern,
      ),
  };
}

/** One confirmation when saved words are cleared; rewording is ordinary editing. */
export function clearsWords(
  previous: { model: IntakeModel; summary: string },
  next: { model: IntakeModel; summary: string },
) {
  return (
    (!!previous.summary.trim() && !next.summary.trim()) ||
    (!!previous.model.puttingOff && !next.model.puttingOff?.trim()) ||
    Object.entries(previous.model.notes).some(
      ([key, value]) =>
        !!value && !next.model.notes[key as keyof IntakeModel["notes"]]?.trim(),
    ) ||
    previous.model.names.some(
      (name, i) => !!name.name.trim() && !next.model.names[i]?.name.trim(),
    )
  );
}
