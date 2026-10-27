"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import { assignTimes, breaksGuardrails, planKinds } from "@/domain/plan-menu";
import { getUserModel, getPlanDay } from "../data/intake";
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
        .max(40, "Use 40 characters or fewer.")
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
  await openToday(v.user.id, options);
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  const item = plan?.items.find((i) => i.stepId === stepId);
  if (!plan || !item)
    return { ok: true, changed: false, note: "That item is already gone." };
  const items: DayItem[] =
    c.choice === "later"
      ? plan.items.map((i) =>
          i === item ? { ...i, minuteOfDay: c.minute } : i,
        )
      : plan.items.filter((i) => i !== item);
  if (c.choice === "let_go")
    await reportStep(v.db, v.user.id, stepId, "not", v.today);
  const diff = diffPlans(plan.items, items);
  const note = templateNote(diff, {
    reason: c.choice === "later" ? "not_today_move" : "not_today_let_go",
  });
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: c.choice === "later" ? "not_today_move" : "not_today_let_go",
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
});

/** The person adds an item of their own to today. */
export async function addPlanItem(input: {
  kind: string;
  title: string;
  minute?: number | null;
}): Promise<ActionResult<Change>> {
  const v = await requireViewer();
  const parsed = addInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { kind, title, minute } = parsed.data;
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (!plan) return { ok: false, errors: { form: "Today is not ready yet." } };
  if (plan.items.length >= 5)
    return {
      ok: false,
      errors: { form: "Your day already has five things. That is plenty." },
    };
  const model = v.profile.memoryOn
    ? (await getUserModel(v.db, v.user.id))?.model
    : undefined;
  const times = assignTimes(
    [...plan.items.map((i) => i.kind), kind],
    model?.wake,
  );
  const item: DayItem = {
    kind,
    title,
    why: "You added this yourself",
    size: "small",
    minuteOfDay: minute ?? times[times.length - 1],
  };
  const items = [...plan.items, item].sort(
    (a, b) => a.minuteOfDay - b.minuteOfDay,
  );
  // Their own words are kept, but a worrying one shows the safety flow.
  const safety = await screen(v.db, v.user.id, "plan-item", [title]);
  const note = `Added "${title}" to today.`;
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(title) ? null : note,
    origin: "you",
    expectVersion: plan.version + 1,
  });
  refresh();
  return {
    ok: true,
    safety,
    changed: written.ok,
    note: written.ok ? note : "Your plan was just changed. Have a look.",
  };
}

/** Takes back the latest change to today's plan. */
export async function undoPlanChange(): Promise<ActionResult> {
  const v = await requireViewer();
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
