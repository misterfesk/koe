"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { librarySmaller } from "@/domain/activities";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import {
  reportDetailInput,
  reportInput,
  stepInput,
  type StepInput,
} from "@/domain/steps";
import { addDays } from "@/domain/time";
import { conversation } from "../db/schema";
import { updateProfile } from "../data/profile";
import {
  addReportDetail,
  createStep,
  deleteStep,
  getStep,
  letGoOfOld,
  reportStep,
  rescheduleStep,
  reviseStep,
  setStepStatus,
  undoReport,
} from "../data/steps";
import type { RiskLevel } from "@/domain/safety";
import { brainstorm, shrinkStep } from "../llm/coach";
import { listMemory } from "../data/memory";
import { getConversation } from "../data/talk";
import { resetIgnored } from "../data/reminders";
import { screen } from "../safety";
import { requireViewer } from "../viewer";

const refresh = () => revalidatePath("/", "layout");
const id = z.string().min(1).max(64);

export async function chooseStep(
  input: StepInput,
): Promise<ActionResult<{ id: string }>> {
  const v = await requireViewer();
  const parsed = stepInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const data = parsed.data;
  // Links to a source are kept only if that source is this person's own.
  const [memory, convo] = await Promise.all([
    data.sourceMemoryId && v.profile.memoryOn
      ? listMemory(v.db, v.user.id)
      : Promise.resolve([]),
    data.sourceConversationId
      ? getConversation(v.db, v.user.id, data.sourceConversationId)
      : Promise.resolve(null),
  ]);
  const stepId = await createStep(
    v.db,
    v.user.id,
    {
      ...data,
      sourceMemoryId: memory.some((m) => m.id === data.sourceMemoryId)
        ? data.sourceMemoryId
        : null,
      sourceConversationId: convo ? convo.id : null,
    },
    v.today,
  );
  const safety = await screen(v.db, v.user.id, "step", [
    data.title,
    data.cue,
    data.problem,
  ]);
  refresh();
  return { ok: true, id: stepId, safety };
}

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
  if (!reportId) return { ok: false, errors: { form: "This step is gone." } };
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

const revision = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Write the smaller version, or keep the step as it is.")
    .max(160, "Use 160 characters or fewer."),
  cue: z.string().trim().max(120, "Use 120 characters or fewer.").optional(),
});

export async function changeStep(
  stepId: string,
  change: { title: string; cue?: string },
): Promise<ActionResult> {
  const v = await requireViewer();
  const parsed = revision.safeParse(change);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const ok = await reviseStep(v.db, v.user.id, id.parse(stepId), {
    title: parsed.data.title,
    cue: parsed.data.cue === undefined ? undefined : parsed.data.cue || null,
  });
  if (!ok) return { ok: false, errors: { form: "This step is gone." } };
  const safety = await screen(v.db, v.user.id, "step", [
    parsed.data.title,
    parsed.data.cue,
  ]);
  refresh();
  return { ok: true, safety };
}

const statuses = z.enum(["active", "paused", "archived"]);

export async function setStatus(stepId: string, status: string) {
  const v = await requireViewer();
  await setStepStatus(
    v.db,
    v.user.id,
    id.parse(stepId),
    statuses.parse(status),
  );
  refresh();
}

const schedule = z.union([
  z.object({ when: z.enum(["today", "tomorrow"]) }),
  z.object({
    when: z.literal("repeat"),
    repeatDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
]);

export async function changeSchedule(
  stepId: string,
  input: { when: string; repeatDays?: number[] },
): Promise<ActionResult> {
  const v = await requireViewer();
  const parsed = schedule.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      errors: { repeatDays: "Pick at least one day, or choose a day." },
    };
  const when = parsed.data;
  await rescheduleStep(
    v.db,
    v.user.id,
    id.parse(stepId),
    when.when === "repeat"
      ? { repeatDays: when.repeatDays }
      : { plannedFor: when.when === "today" ? v.today : addDays(v.today, 1) },
  );
  refresh();
  return { ok: true };
}

export async function removeStep(stepId: string) {
  const v = await requireViewer();
  await deleteStep(v.db, v.user.id, id.parse(stepId));
  refresh();
}

/** Smaller versions of a step: AI options when available, else the library. */
export async function smallerVersions(input: {
  stepId?: string;
  title?: string;
}): Promise<{ options: string[]; source: "ai" | "library" | "none" }> {
  const v = await requireViewer();
  let title = input.title?.trim().slice(0, 160) ?? "";
  let cue: string | null = null;
  if (input.stepId) {
    const s = await getStep(v.db, v.user.id, id.parse(input.stepId));
    if (!s) return { options: [], source: "none" };
    title = s.title;
    cue = s.cue;
  }
  if (!title) return { options: [], source: "none" };
  const risky =
    !input.stepId &&
    (await screen(v.db, v.user.id, "step", [title])) !== "none";
  if (!risky && !v.profile.coachingPausedAt) {
    const options = await shrinkStep(title, cue, v.user.id);
    if (options.length) return { options, source: "ai" };
  }
  const fallback = librarySmaller(title);
  return fallback
    ? { options: [fallback], source: "library" }
    : { options: [], source: "none" };
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
