"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import { planKinds } from "@/domain/plan-menu";
import { getPlanDay } from "../data/intake";
import {
  keepDraft,
  saveCheckIn,
  setVsExpected,
  undoLastChange,
  writePlanVersion,
} from "../data/plan";
import { reportStep } from "../data/steps";
import { diffPlans, templateNote, type DayItem } from "@/domain/day-plan";
import { openToday, planToday } from "../llm/planner";
import { screen } from "../safety";
import { addToToday, moveItemTo, planEditPaused } from "../plan-edit";
import { addNote } from "../data/notes";
import { requireViewer } from "../viewer";

const refresh = () => revalidatePath("/", "layout");
const id = z.string().min(1).max(64);

type Change = { changed: boolean; note: string };

/**
 * The daily check-in. Saved once per day (a later change replaces it), then
 * the planner adapts today's plan. The tap itself is the person's request, so
 * the plan changes at once, with the note and an undo.
 */
export async function submitCheckIn(input: {
  energy: string;
  word?: string;
}): Promise<ActionResult<Change>> {
  const v = await requireViewer();
  const parsed = z
    .object({
      energy: z.enum(["low", "okay", "more"]),
      word: z
        .string()
        .trim()
        .max(500, "Use 500 characters or fewer.")
        .transform((w) => w || null)
        .optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { energy } = parsed.data;
  const word = parsed.data.word ?? null;

  // Their word is kept (it is theirs), but a worrying one pauses planning
  // by the model and shows the fixed safety flow.
  await saveCheckIn(v.db, v.user.id, v.today, energy, word);
  const safety = await screen(v.db, v.user.id, "check-in", [word]);
  const result = await planToday(
    v.user.id,
    { reason: "check_in", energy, word: safety === "none" ? word : null },
    { db: v.db, today: v.today },
  );
  refresh();
  return { ok: true, safety, changed: result.changed, note: result.note };
}

/** "Keep it" on a day's draft: the plan stays as written and the draft banner goes. */
export async function keepTodaysPlan(): Promise<ActionResult> {
  const v = await requireViewer();
  const r = await keepDraft(v.db, v.user.id, v.today);
  refresh();
  return r.ok
    ? { ok: true }
    : { ok: false, errors: { form: "That plan has already changed." } };
}

/** "This is too much today": a lighter day. */
export async function tooMuchToday(): Promise<ActionResult<Change>> {
  const v = await requireViewer();
  const result = await planToday(
    v.user.id,
    { reason: "lighter" },
    { db: v.db, today: v.today },
  );
  refresh();
  return { ok: true, changed: result.changed, note: result.note };
}

const choice = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("shrink") }),
  z.object({ choice: z.literal("swap") }),
  z.object({ choice: z.literal("let_go") }),
  z.object({
    choice: z.literal("later"),
    minute: z.number().int().min(0).max(1439),
  }),
]);

/** What the person chose after "Not today" on a plan item. */
export async function notToday(
  itemId: string,
  input: { choice: string; minute?: number },
): Promise<ActionResult<Change>> {
  const v = await requireViewer();
  if (await planEditPaused(v))
    return {
      ok: false,
      errors: { form: "Open Today to resume before changing your plan." },
    };
  const parsed = choice.safeParse(input);
  if (!parsed.success)
    return { ok: false, errors: { form: "Choose one of the options." } };
  const stepId = id.parse(itemId);
  const options = { db: v.db, today: v.today };
  const c = parsed.data;

  if (c.choice === "shrink" || c.choice === "swap") {
    const r = await planToday(
      v.user.id,
      {
        reason: c.choice === "shrink" ? "not_today_shrink" : "not_today_swap",
        itemId: stepId,
      },
      options,
    );
    refresh();
    return { ok: true, changed: r.changed, note: r.note };
  }

  // Moving or letting go are the person's own edits, written the same way.
  if (c.choice === "later") {
    const r = await moveItemTo(v, stepId, c.minute);
    refresh();
    return r.ok
      ? { ok: true, changed: r.changed, note: r.note }
      : { ok: false, errors: { form: r.error } };
  }
  await openToday(v.user.id, options);
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  const item = plan?.items.find((i) => i.stepId === stepId);
  if (!plan || !item)
    return { ok: true, changed: false, note: "That is already off today." };
  const items: DayItem[] = plan.items.filter((i) => i !== item);
  await reportStep(v.db, v.user.id, stepId, "not", v.today);
  const diff = diffPlans(plan.items, items);
  const note = templateNote(diff, { reason: "not_today_let_go" });
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "not_today_let_go",
    note,
    origin: "you",
    expectVersion: plan.version + 1,
  });
  refresh();
  return {
    ok: true,
    changed: written.ok,
    note: written.ok ? note : "Your plan was just changed. Have a look.",
  };
}

const addInput = z.object({
  kind: z.enum(planKinds),
  title: z
    .string()
    .trim()
    .min(1, "Write a few words.")
    .max(80, "Use 80 characters or fewer."),
  minute: z.number().int().min(0).max(1439).nullable().optional(),
  problem: z
    .string()
    .trim()
    .max(3000, "Use 3,000 characters or fewer.")
    .optional(),
});

/** The person adds an item of their own to today. */
export async function addPlanItem(input: {
  kind: string;
  title: string;
  minute?: number | null;
  problem?: string;
}): Promise<ActionResult<Change>> {
  const v = await requireViewer();
  const parsed = addInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { kind, title, minute, problem } = parsed.data;
  if (await planEditPaused(v))
    return {
      ok: false,
      errors: { form: "Open Today to resume before changing your plan." },
    };
  // Their own words are kept, but a worrying one shows the safety flow.
  const safety = await screen(v.db, v.user.id, "plan-item", [title, problem]);
  if (safety !== "none") {
    await addNote(v.db, v.user.id, {
      text: [title, problem].filter(Boolean).join("\n\n"),
    });
    refresh();
    return {
      ok: true,
      safety,
      changed: false,
      note: "Your words are saved in Notes. Your plan stays as it is.",
    };
  }
  const r = await addToToday(v, {
    kind,
    title,
    why: "You added this yourself",
    size: "small",
    minute,
    origin: "you",
    problem,
  });
  refresh();
  if (!r.ok) return { ok: false, errors: { form: r.error } };
  return { ok: true, safety, changed: r.changed, note: r.note };
}

/** Takes back the latest change to today's plan. */
export async function undoPlanChange(): Promise<ActionResult> {
  const v = await requireViewer();
  if (await planEditPaused(v))
    return {
      ok: false,
      errors: { form: "Open Today to resume before changing your plan." },
    };
  const r = await undoLastChange(v.db, v.user.id, v.today);
  refresh();
  if (!r.ok)
    return { ok: false, errors: { form: "There is nothing to undo." } };
  return { ok: true };
}

/** "Compared with what you expected: better, about the same, worse." */
export async function rateVsExpected(
  reportId: string,
  value: string | null,
): Promise<ActionResult> {
  const v = await requireViewer();
  const parsed = z
    .enum(["better", "same", "worse"])
    .nullable()
    .safeParse(value);
  if (!parsed.success) return { ok: false, errors: { form: "Pick one." } };
  const ok = await setVsExpected(
    v.db,
    v.user.id,
    id.parse(reportId),
    parsed.data,
  );
  if (ok) refresh();
  return ok ? { ok: true } : { ok: false, errors: { form: "That is gone." } };
}
