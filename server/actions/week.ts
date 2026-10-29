"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { WeekView } from "@/domain/week";
import { reviewWeek } from "../data/week";
import { allow } from "../rate-limit";
import { startShelfAfterSave } from "../search/shelf";
import { requireViewer } from "../viewer";

export type WeekReviewResult =
  { ok: true; week: WeekView | null } | { ok: false; error: string };

const reviewInput = z.object({
  weekId: z.string().min(1).max(64),
  expectedVersion: z.number().int().positive(),
  createId: z.string().uuid(),
  decisions: z
    .array(
      z.object({
        itemId: z.string().min(1).max(64),
        choice: z.enum(["keep", "change", "let_go"]),
        title: z.string().max(200).optional(),
        when: z.string().max(200).optional(),
      }),
    )
    .max(3),
});

/** Answers the week review on Today. Owner-scoped; starts the next week if anything is kept. */
export async function submitWeekReview(
  raw: unknown,
): Promise<WeekReviewResult> {
  const v = await requireViewer();
  const parsed = reviewInput.safeParse(raw);
  if (!parsed.success || v.profile.coachingPausedAt)
    return {
      ok: false,
      error: "This week changed. Open it again before saving.",
    };
  if (!(await allow("week-review", v.user.id)))
    return {
      ok: false,
      error: "Too many tries. Wait a minute and try again.",
    };
  try {
    const week = await reviewWeek(v.db, v.user.id, {
      ...parsed.data,
      today: v.today,
    });
    if (week) startShelfAfterSave(v);
    revalidatePath("/today");
    return { ok: true, week };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error &&
        /^(Open this week again|This week changed|Give it a few words\.|Try different words for this one\.|Check the titles before saving)/.test(
          error.message,
        )
          ? error.message
          : "Check your words and try again.",
    };
  }
}
