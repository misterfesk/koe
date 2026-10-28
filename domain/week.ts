import { z } from "zod";

export const capturedThingSchema = z.object({
  what: z.string().trim().min(1).max(400),
  when: z.string().trim().max(200).default(""),
  title: z.string().trim().min(1).max(60),
});
export type CapturedThing = z.infer<typeof capturedThingSchema>;
/** Fallback title: the first sentence of `what`, cut at a word to <=60 chars. */
export function fallbackTitle(what: string) {
  const sentence = (what.trim().split(/(?<=[.!?])\s+|\n/)[0] ?? "").trim();
  let title = sentence;
  if (title.length > 60) {
    const cut = title.slice(0, 61);
    const space = cut.lastIndexOf(" ");
    title = space > 0 ? cut.slice(0, space) : title.slice(0, 60);
  }
  title = title.replace(/[\s.,;:!?…—–-]+$/u, "").trim();
  if (!title) title = what.trim().slice(0, 60).trim() || "This week";
  return title.charAt(0).toUpperCase() + title.slice(1);
}
/**
 * Titles leave the deadline out: drops a trailing `when` and a dangling
 * due/by, then upper-cases the first letter. Returns "" if nothing is left.
 */
export function tidyTitle(title: string, when = "") {
  let value = title.trim();
  const deadline = when.trim().replace(/[.!?]+$/, "");
  // "due Friday" also matches a title ending "by Friday".
  const core = deadline.replace(/^(?:due|by|before|on|until)\s+/i, "");
  for (const part of [deadline, core].filter(Boolean)) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(
      new RegExp(`[\\s,;:-]*${escaped}[\\s.!?]*$`, "i"),
      "",
    );
  }
  value = value
    .replace(/[\s,;:-]+(?:due|by|before|until)$/i, "")
    .replace(/[\s.,;:!?…—–-]+$/u, "")
    .trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}
/** Older rows can carry retired fields or no title; keep what still reads. */
export function readCaptured(raw: unknown): CapturedThing {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const what = typeof value.what === "string" ? value.what : "";
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title
      : fallbackTitle(what);
  return capturedThingSchema.parse({
    what,
    when: typeof value.when === "string" ? value.when : "",
    title,
  });
}
export const weekDraftSchema = z.object({
  items: z
    .array(
      z.object({
        proposalId: z.string().uuid().optional(),
        captured: capturedThingSchema,
      }),
    )
    .min(1)
    .max(3),
});
export type WeekDraft = z.infer<typeof weekDraftSchema>;
export type WeekView = {
  id: string;
  version: number;
  startedOn: string;
  reviewOn: string;
  items: { id: string; captured: CapturedThing }[];
};
export function reviewDue(week: Pick<WeekView, "reviewOn">, today: string) {
  return today >= week.reviewOn;
}
/** "By {when}" unless the words already read as a time ("due Monday", "This week"). */
export function whenLabel(when: string) {
  const value = when.trim();
  if (!value) return "";
  if (
    /^(by|due|before|on|this|next|today|tomorrow|end|until|in)\b/i.test(value)
  )
    return value.charAt(0).toUpperCase() + value.slice(1);
  return `By ${value}`;
}
export function reviewDate(startedOn: string) {
  const date = new Date(startedOn + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
