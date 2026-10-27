import "server-only";
import { diffPlans, templateNote, type DayItem } from "@/domain/day-plan";
import {
  assignTimes,
  breaksGuardrails,
  type PlanKind,
  type PlanOrigin,
  type PlanSize,
} from "@/domain/plan-menu";
import { getPlanDay, getUserModel } from "./data/intake";
import { writePlanVersion } from "./data/plan";
import { openToday } from "./llm/planner";
import type { Viewer } from "./viewer";

// The person's own edits to today's plan, shared by the Today screen and by
// Talk's confirmed cards, so there is one way each change is written (a new
// plan version with a note, which Today can undo).

export type Edit =
  { ok: true; changed: boolean; note: string } | { ok: false; error: string };

const JUST_CHANGED = "Your plan was just changed. Have a look.";

/** Moves one item to a new time. */
export async function moveItemTo(
  v: Viewer,
  itemId: string,
  minute: number,
): Promise<Edit> {
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  const item = plan?.items.find((i) => i.stepId === itemId);
  if (!plan || !item)
    return { ok: true, changed: false, note: "That item is already gone." };
  const items: DayItem[] = plan.items.map((i) =>
    i === item ? { ...i, minuteOfDay: minute } : i,
  );
  const note = templateNote(diffPlans(plan.items, items), {
    reason: "not_today_move",
  });
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "not_today_move",
    note,
    origin: "you",
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note }
    : { ok: true, changed: false, note: JUST_CHANGED };
}

/** Adds one item to today (five at most). The caller has checked the words. */
export async function addToToday(
  v: Viewer,
  a: {
    kind: PlanKind;
    title: string;
    why: string;
    size: PlanSize;
    minute?: number | null;
    origin: PlanOrigin;
  },
): Promise<Edit> {
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (!plan) return { ok: false, error: "Today is not ready yet." };
  if (plan.items.length >= 5)
    return {
      ok: false,
      error: "Your day already has five things. That is plenty.",
    };
  const model = v.profile.memoryOn
    ? (await getUserModel(v.db, v.user.id))?.model
    : undefined;
  const times = assignTimes(
    [...plan.items.map((i) => i.kind), a.kind],
    model?.wake,
  );
  const item: DayItem = {
    kind: a.kind,
    title: a.title,
    why: a.why,
    size: a.size,
    minuteOfDay: a.minute ?? times[times.length - 1],
  };
  const items = [...plan.items, item].sort(
    (x, y) => x.minuteOfDay - y.minuteOfDay,
  );
  const note = `Added "${a.title}" to today.`;
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(a.title) ? null : note,
    origin: a.origin,
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note }
    : { ok: true, changed: false, note: JUST_CHANGED };
}
