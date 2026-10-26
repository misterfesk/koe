import { z } from "zod";
import type { ToneContext } from "./tone";
export const contactMessage = z
  .string()
  .trim()
  .min(1, "Write a message, or leave this for now.")
  .max(1000, "Use 1000 characters or fewer.");
export const careTasks = [
  "Look for a local service",
  "Check cost and access",
  "Prepare a question",
  "Choose whether to share notes",
] as const;
export const careInput = z.object({
  originalNotes: z.string().max(3000),
  editedSummary: z.string().max(4000),
  inquiryDraft: z.string().max(2000),
  questions: z.string().max(1500),
  checklist: z.array(z.enum(careTasks)),
});
export function prepareCareExport(input: z.infer<typeof careInput>) {
  const result = careInput.safeParse(input);
  return result.success
    ? {
        success: true as const,
        data: { kind: "synthetic-care-preparation", ...result.data },
      }
    : { success: false as const, error: result.error };
}
export function contactContext(outcome: string): ToneContext {
  return outcome === "No reply" || outcome === "Prefer not to say"
    ? "setback"
    : outcome === "Connected"
      ? "done"
      : "welcome";
}
