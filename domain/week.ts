import { z } from "zod";

export const capturedThingSchema = z.object({
  what: z.string().trim().min(1).max(400),
  originalWhat: z.string().trim().max(400).optional(),
  done: z.string().trim().max(400).default(""),
  left: z.string().trim().max(400).default(""),
  stuck: z.string().trim().max(400).default(""),
  when: z.string().trim().max(200).default(""),
});
export type CapturedThing = z.infer<typeof capturedThingSchema>;
export const pieceSchema = z.object({
  title: z.string().trim().min(1).max(80),
  size: z.enum(["tiny", "small", "medium"]),
  minutes: z.number().int().min(1).max(25),
  endpoint: z.string().trim().min(1).max(240),
  when: z.string().trim().min(1).max(160),
  sourcePhrase: z.string().trim().min(1).max(400),
});
export type Piece = z.infer<typeof pieceSchema>;
export const weekDraftSchema = z.object({
  items: z
    .array(
      z.object({
        proposalId: z.string().uuid().optional(),
        captured: capturedThingSchema,
        pieces: z.array(pieceSchema).min(1).max(6),
      }),
    )
    .min(1)
    .max(3),
});
export type WeekDraft = z.infer<typeof weekDraftSchema>;
export type PieceView = Piece & {
  id: string;
  status: "ready" | "done" | "released";
  order: number;
};
export type WeekView = {
  id: string;
  version: number;
  startedOn: string;
  reviewOn: string;
  items: { id: string; captured: CapturedThing; pieces: PieceView[] }[];
};
export function reviewDue(week: Pick<WeekView, "reviewOn">, today: string) {
  return today >= week.reviewOn;
}
export function whatMoved(week: WeekView) {
  return week.items.flatMap((i) => i.pieces).filter((p) => p.status === "done")
    .length;
}
export function reviewDate(startedOn: string) {
  const date = new Date(startedOn + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
