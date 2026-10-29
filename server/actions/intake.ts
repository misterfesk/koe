"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import {
  freeTexts,
  intakeModel,
  type IntakeModel,
  type Reveal,
} from "@/domain/intake";
import {
  breaksGuardrails,
  checkComposition,
  contextFor,
  detectEatingConcern,
  planItemSchema,
} from "@/domain/plan-menu";
import type { RiskLevel } from "@/domain/safety";
import { EVERY_DAY, inQuietHours } from "@/domain/reminders";
import { localMinutes } from "@/domain/time";
import { commitIntroInTransaction, getPlanDay } from "../data/intake";
import { consumeInterviewApproval } from "../interview-state";
import { saveWeekInTransaction } from "../data/week";
import { introDay } from "@/domain/week-picker";
import {
  setMorningReminder,
  setReminder,
  subscriptionsFor,
} from "../data/reminders";
import { screen } from "../safety";
import { synthesiseIntake, templateResult } from "../llm/intake";
import { requireViewer } from "../viewer";
import { startShelfAfterSave } from "../search/shelf";

const refresh = () => revalidatePath("/", "layout");

/**
 * Screens free text with the rules check as soon as a question is answered,
 * so the fixed safety flow appears right there. Words that trip it are
 * dropped by the client and never reach the model.
 */
export async function checkIntakeText(
  texts: string[],
): Promise<{ safety: RiskLevel }> {
  const v = await requireViewer();
  const safe = z
    .array(z.string().max(400))
    .max(8)
    .parse(texts)
    .filter((t) => t.trim());
  // No revalidation here: the intro shows the safety flow itself, and a
  // refreshed page would swap it for a fresh start and lose the answers.
  const level = safe.length
    ? await screen(v.db, v.user.id, "intake", safe)
    : "none";
  return { safety: level };
}

/**
 * Food and weight worry switches off food and exercise items. The words
 * themselves are dropped from the saved model: the flag is enough to plan
 * safely, and the person decides what Koe remembers.
 */
function withEatingFlag(model: IntakeModel): IntakeModel {
  const texty = (t?: string) => !!t && detectEatingConcern(t);
  const concern = freeTexts(model).some(texty) || model.eatingConcern;
  if (!concern) return model;
  const keep = (t?: string) => (texty(t) ? undefined : t);
  return {
    ...model,
    eatingConcern: true,
    puttingOff: keep(model.puttingOff),
    notes: {
      goals: keep(model.notes.goals),
      day: keep(model.notes.day),
      lifts: keep(model.notes.lifts),
      people: keep(model.notes.people),
    },
  };
}

/** The one AI pass: answers in, a reveal to edit and approve out. */
export async function buildReveal(
  input: unknown,
  forceFallback = false,
): Promise<ActionResult<{ reveal: Reveal | null }>> {
  const v = await requireViewer();
  const parsed = intakeModel.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  // Screened again here: this action can be called without the screens above.
  const safety = await screen(
    v.db,
    v.user.id,
    "intake",
    freeTexts(parsed.data),
  );
  if (safety !== "none") return { ok: true, safety, reveal: null };

  const model = withEatingFlag(parsed.data);
  // While coaching is paused no model is called for this person.
  const synthesis =
    v.profile.coachingPausedAt || !v.profile.memoryOn || forceFallback === true
      ? templateResult(model)
      : await synthesiseIntake(model, v.user.id);
  return {
    ok: true,
    safety: "none",
    reveal: {
      summary: synthesis.summary,
      memories: v.profile.memoryOn ? synthesis.memories : [],
      items: synthesis.items,
      model,
      eatingConcern: model.eatingConcern,
      source: synthesis.source,
      reminderRules: {
        quietStart: v.profile.quietStart,
        quietEnd: v.profile.quietEnd,
        nowMinute: localMinutes(v.profile.timezone),
      },
    },
  };
}

const startInput = z.object({
  model: intakeModel,
  summary: z.string().trim().max(400),
  memories: z
    .array(
      z.object({
        kind: z.enum(["helps", "hard", "people", "preference"]),
        text: z.string().trim().min(1).max(120),
      }),
    )
    .max(4),
  savePeople: z.array(z.string().trim().min(1).max(40)).max(3),
  items: z.array(planItemSchema).min(1).max(3),
  // "Remind me for each of these": only honoured once a device is set up.
  remindItems: z.boolean().default(false),
  morningPlanMinute: z.number().int().min(0).max(1439).nullable().default(null),
  interview: z
    .object({ token: z.string().min(1).max(100_000), draft: z.unknown() })
    .optional(),
});

/** "Start my day": writes approved choices; the caller clears its draft before navigation. */
export async function startMyDay(input: unknown): Promise<ActionResult> {
  const v = await requireViewer();
  if (v.profile.coachingPausedAt) return { ok: true, safety: "concern" };
  const parsed = startInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const model = withEatingFlag(parsed.data.model);
  const { summary, memories, items } = parsed.data;

  // Everything the person typed or edited goes through the rules check first.
  const level = await screen(v.db, v.user.id, "intake", [
    summary,
    ...memories.map((m) => m.text),
    ...freeTexts(model),
  ]);
  if (level !== "none") return { ok: true, safety: level };

  // The plan comes back from the browser, so it is checked again here.
  const textBroken = items.some(
    (i) => breaksGuardrails(i.title) || breaksGuardrails(i.why),
  );
  const ruleBroken = checkComposition(items, contextFor(model)).some(
    (x) => !["count", "no_lift", "no_core"].includes(x.code),
  );
  if (textBroken || ruleBroken)
    return {
      ok: false,
      errors: {
        form: "Something in this plan can't be used. Go back and try again.",
      },
    };

  const saveable = new Set(model.names.map((n) => n.name.trim().toLowerCase()));
  let approval: Awaited<
    ReturnType<typeof consumeInterviewApproval>
  >["approval"] = null;
  if (parsed.data.interview) {
    try {
      const checked = await consumeInterviewApproval(
        v,
        parsed.data.interview.token,
        parsed.data.interview.draft,
      );
      if (checked.safety !== "none")
        return { ok: true, safety: checked.safety };
      if (checked.unavailable || !checked.approval)
        return {
          ok: false,
          errors: {
            form: "Your week couldn't be checked. Try Start my day again.",
          },
        };
      approval = checked.approval;
    } catch {
      return {
        ok: false,
        errors: {
          form: "Your week couldn't be confirmed. Open the interview again before saving.",
        },
      };
    }
  }
  await v.db.transaction(async (tx) => {
    // A week saved here shapes day 1: its things plus one intro anchor.
    const week = approval
      ? await saveWeekInTransaction(tx, v.user.id, approval)
      : null;
    await commitIntroInTransaction(tx, v.user.id, {
      model,
      summary,
      memories,
      people: parsed.data.savePeople.filter((n) =>
        saveable.has(n.trim().toLowerCase()),
      ),
      items: week ? introDay(items, week.items, model.wake) : items,
      memoryOn: v.profile.memoryOn,
      today: v.today,
    });
  });
  const wantsAny =
    parsed.data.remindItems || parsed.data.morningPlanMinute !== null;
  const subs = wantsAny ? await subscriptionsFor(v.db, [v.user.id]) : [];
  const morning = parsed.data.morningPlanMinute;
  // A reminder inside quiet hours would never arrive, so it is not saved (the
  // reveal says so; You → Reminders shows the same). Same for an entry
  // whose time has already passed today.
  if (
    subs.length &&
    morning !== null &&
    !inQuietHours(morning, v.profile.quietStart, v.profile.quietEnd)
  )
    await setMorningReminder(v.db, v.user.id, morning, v.profile.timezone);
  if (parsed.data.remindItems) {
    const plan = subs.length
      ? await getPlanDay(v.db, v.user.id, v.today)
      : null;
    const now = localMinutes(v.profile.timezone);
    for (const item of plan?.items ?? []) {
      if (
        !item.stepId ||
        item.minuteOfDay <= now ||
        inQuietHours(item.minuteOfDay, v.profile.quietStart, v.profile.quietEnd)
      )
        continue;
      await setReminder(
        v.db,
        v.user.id,
        { stepId: item.stepId, minuteOfDay: item.minuteOfDay, days: EVERY_DAY },
        v.profile.timezone,
      );
    }
  }
  // Day one: the Shelf search starts in the background (v3 A6).
  startShelfAfterSave(v);
  refresh();
  return { ok: true };
}
