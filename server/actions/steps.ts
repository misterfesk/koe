"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import { reportDetailInput, reportInput } from "@/domain/steps";
import { conversation } from "../db/schema";
import { updateProfile } from "../data/profile";
import {
  addReportDetail,
  letGoOfOld,
  reportStep,
  undoReport,
} from "../data/steps";
import type { RiskLevel } from "@/domain/safety";
import { brainstorm } from "../llm/coach";
import { resetIgnored } from "../data/reminders";
import { screen } from "../safety";
import { requireViewer } from "../viewer";

const refresh = () => revalidatePath("/", "layout");
const id = z.string().min(1).max(64);

export async function reportHowItWent(
  stepId: string,
  outcome: string,
): Promise<ActionResult<{ reportId: string }>> {
  const v = await requireViewer();
  const parsed = reportInput.safeParse({ stepId, outcome });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const reportId = await reportStep(
    v.db,
    v.user.id,
    parsed.data.stepId,
    parsed.data.outcome,
    v.today,
  );
  if (!reportId)
    return { ok: false, errors: { form: "This is no longer here." } };
  await resetIgnored(v.db, v.user.id, parsed.data.stepId);
  refresh();
  return { ok: true, reportId };
}

export async function addHowItWentDetail(input: {
  reportId: string;
  helped?: string | null;
  barrier?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  const v = await requireViewer();
  const parsed = reportDetailInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { reportId, ...detail } = parsed.data;
  const stepId = await addReportDetail(v.db, v.user.id, reportId, detail);
  if (!stepId) return { ok: false, errors: { form: "This report is gone." } };
  const safety = await screen(v.db, v.user.id, "report", [
    detail.barrier,
    detail.note,
  ]);
  refresh();
  return { ok: true, safety };
}

export async function takeBackReport(reportId: string) {
  const v = await requireViewer();
  await undoReport(v.db, v.user.id, id.parse(reportId));
  refresh();
}

/** Brainstorm help for problem solving. The problem text is screened first. */
export async function problemIdeas(
  problem: string,
  own: string[],
): Promise<{ ideas: string[]; safety: RiskLevel; available: boolean }> {
  const v = await requireViewer();
  const text = z.string().trim().min(1).max(1000).safeParse(problem);
  if (!text.success) return { ideas: [], safety: "none", available: true };
  const mine = own
    .map((o) => o.trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 6);
  const safety = await screen(v.db, v.user.id, "problem", [text.data, ...mine]);
  if (safety !== "none") {
    refresh();
    return { ideas: [], safety, available: true };
  }
  if (v.profile.coachingPausedAt)
    return { ideas: [], safety, available: false };
  const ideas = await brainstorm(text.data, mine, v.user.id);
  return { ideas, safety, available: ideas.length > 0 };
}

export async function resumeCoaching() {
  const v = await requireViewer();
  await updateProfile(v.db, v.user.id, { coachingPausedAt: null });
  await v.db
    .update(conversation)
    .set({ safetyPausedAt: null })
    .where(eq(conversation.userId, v.user.id));
  refresh();
}

/** After time away: optionally let go of old one-off steps, then carry on. */
export async function welcomeBack(fresh: boolean) {
  const v = await requireViewer();
  if (fresh) await letGoOfOld(v.db, v.user.id, v.today);
  await updateProfile(v.db, v.user.id, { lastSeenAt: new Date() });
  refresh();
}
