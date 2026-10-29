"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { WeekView } from "@/domain/week";
import { reviewWeek } from "../data/week";
import { interviewSafety } from "../interview-state";
import { redraftToday } from "../llm/planner";
import { allow } from "../rate-limit";
import { startShelfAfterSave } from "../search/shelf";
import { requireViewer } from "../viewer";

export type WeekReviewResult =
  | { ok: true; week: WeekView | null }
  | { ok: false; error: string }
  /** Coaching is paused, or the new words matched a risk: show the safety check. */
  | { ok: false; safety: true };

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
  if (v.profile.coachingPausedAt) return { ok: false, safety: true };
  if (!parsed.success)
    return {
      ok: false,
      error: "This week changed. Open it again before saving.",
    };
  if (!(await allow("week-review", v.user.id)))
    return {
      ok: false,
      error: "Too many tries. Wait a minute and try again.",
    };
  // The same check the interview runs on new words (rules, then the model).
  const gate = await interviewSafety(
    v,
    parsed.data.decisions
      .filter((d) => d.choice === "change")
      .flatMap((d) => [d.title ?? "", d.when ?? ""]),
  );
  if (gate.safety !== "none") return { ok: false, safety: true };
  if (gate.unavailable)
    return {
      ok: false,
      error: "Your answer couldn't be checked. Try again. Your draft is kept.",
    };
  try {
    const week = await reviewWeek(v.db, v.user.id, {
      ...parsed.data,
      today: v.today,
    });
    // An unkept draft built from the old week is rebuilt from the new one.
    await redraftToday(v.user.id, { db: v.db, today: v.today }).catch(
      () => false,
    );
    if (week) startShelfAfterSave(v);
    revalidatePath("/today");
    return { ok: true, week };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error &&
        /^(Open this week again|This week changed|Give it a few words\.|Try different words for this one\.|Check the titles before saving|Keep it under 60|Try it without)/.test(
          error.message,
        )
          ? error.message
          : "Check your words and try again.",
    };
  }
}
