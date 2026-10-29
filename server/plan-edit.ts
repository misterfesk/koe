import "server-only";
import { and, eq } from "drizzle-orm";
import { diffPlans, templateNote, type DayItem } from "@/domain/day-plan";
import {
  assignTimes,
  breaksGuardrails,
  LAST_MINUTE,
  mentionsFood,
  mentionsExercise,
  type PlanKind,
  type PlanOrigin,
  type PlanSize,
} from "@/domain/plan-menu";
import { detectRisk } from "@/domain/safety";
import { spaceOut } from "@/domain/week-picker";
import { readCaptured } from "@/domain/week";
import { open, seal } from "./crypto";
import { getPlanDay, getUserModel } from "./data/intake";
import { writePlanVersion } from "./data/plan";
import { openToday } from "./llm/planner";
import type { Viewer } from "./viewer";
import { profile, weekItem } from "./db/schema";

export async function planEditPaused(v: Viewer) {
  const [p] = await v.db
    .select({ paused: profile.coachingPausedAt })
    .from(profile)
    .where(eq(profile.userId, v.user.id));
  return !!p?.paused;
}

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
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
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
    problem?: string;
  },
): Promise<Edit> {
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
  // Memory off stops model sharing, not local food and movement protections.
  const storedModel = (await getUserModel(v.db, v.user.id))?.model;
  if (breaksGuardrails(a.title))
    return {
      ok: false,
      error: "Choose something without weight, diet or treatment advice.",
    };
  if (
    storedModel?.eatingConcern &&
    (a.kind === "move" || mentionsFood(a.title) || mentionsExercise(a.title))
  )
    return {
      ok: false,
      error: "Choose something without food or exercise for today.",
    };
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (!plan) return { ok: false, error: "Today is not ready yet." };
  if (plan.items.length >= 5)
    return {
      ok: false,
      error: "Your day already has five things. That is plenty.",
    };
  const model = v.profile.memoryOn ? storedModel : undefined;
  const times = assignTimes(
    [...plan.items.map((i) => i.kind), a.kind],
    model?.wake,
  );
  const item: DayItem = {
    kind: a.kind,
    title: a.title,
    why: a.why,
    size: plan.energy === "low" || plan.mode === "lighter" ? "tiny" : a.size,
    ...(a.problem ? { problem: a.problem } : {}),
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

/** Adds 1–5 accepted sub-areas from a topic breakdown to today in one versioned write. */
export async function addSubareasToToday(
  v: Viewer,
  topic: string,
  subareas: {
    kind?: PlanKind;
    title: string;
    size?: PlanSize;
    why?: string | null;
  }[],
): Promise<Edit & { addedCount?: number }> {
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
  const storedModel = (await getUserModel(v.db, v.user.id))?.model;
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (!plan) return { ok: false, error: "Today is not ready yet." };
  const room = Math.max(0, 5 - plan.items.length);
  if (room === 0)
    return {
      ok: false,
      error: "Your day already has five things. That is plenty.",
    };
  const model = v.profile.memoryOn ? storedModel : undefined;
  const seen = new Set(plan.items.map((i) => i.title.trim().toLowerCase()));
  const valid: DayItem[] = [];
  for (const s of subareas) {
    if (valid.length >= room) break;
    const title = s.title.trim();
    if (title.length < 3 || title.length > 80) continue;
    if (breaksGuardrails(title) || detectRisk(title) !== "none") continue;
    const kind = s.kind ?? "work_chunk";
    if (
      storedModel?.eatingConcern &&
      (kind === "move" || mentionsFood(title) || mentionsExercise(title))
    )
      continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const why = s.why?.trim() || `Because you are working on ${topic}`;
    const times = assignTimes(
      [...plan.items.map((i) => i.kind), ...valid.map((i) => i.kind), kind],
      model?.wake,
    );
    valid.push({
      kind,
      title,
      why,
      size:
        plan.energy === "low" || plan.mode === "lighter"
          ? "tiny"
          : (s.size ?? "small"),
      minuteOfDay: times[times.length - 1],
    });
  }
  if (!valid.length)
    return {
      ok: false,
      error: "Pick at least one to add to today.",
    };
  const items = spaceOut([...plan.items, ...valid]);
  const note =
    valid.length === 1
      ? `Added "${valid[0].title}" to today.`
      : `Added ${valid.length} parts of "${topic}" to today.`;
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(note) ? null : note,
    origin: "talk",
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note, addedCount: valid.length }
    : { ok: true, changed: false, note: JUST_CHANGED };
}

/** Renames or changes one item on today's plan (and updates its week_item title if linked). */
export async function editPlanItem(
  v: Viewer,
  itemId: string,
  change: { title: string; size?: PlanSize; minute?: number },
): Promise<Edit> {
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
  const title = change.title.trim();
  const storedModel = (await getUserModel(v.db, v.user.id))?.model;
  if (breaksGuardrails(title) || detectRisk(title) !== "none")
    return {
      ok: false,
      error: "Choose something without weight, diet or treatment advice.",
    };
  if (
    storedModel?.eatingConcern &&
    (mentionsFood(title) || mentionsExercise(title))
  )
    return {
      ok: false,
      error: "Choose something without food or exercise for today.",
    };
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  const item = plan?.items.find((i) => i.stepId === itemId);
  if (!plan || !item)
    return { ok: true, changed: false, note: "That one is already gone." };
  const updated: DayItem = {
    ...item,
    title,
    size: change.size ?? item.size,
    minuteOfDay: change.minute ?? item.minuteOfDay,
  };
  const items = plan.items
    .map((i) => (i === item ? updated : i))
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  if (item.weekItemId && title !== item.title) {
    const [row] = await v.db
      .select()
      .from(weekItem)
      .where(
        and(eq(weekItem.id, item.weekItemId), eq(weekItem.userId, v.user.id)),
      );
    if (row) {
      const cap = readCaptured(JSON.parse(open(row.capturedEnc)));
      await v.db
        .update(weekItem)
        .set({ capturedEnc: seal(JSON.stringify({ ...cap, title })) })
        .where(and(eq(weekItem.id, row.id), eq(weekItem.userId, v.user.id)));
    }
  }
  const note =
    title !== item.title
      ? `Renamed "${item.title}" to "${title}".`
      : templateNote(diffPlans(plan.items, items), { reason: "edit" });
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(note) ? null : note,
    origin: "talk",
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note }
    : { ok: true, changed: false, note: JUST_CHANGED };
}

/** Splits one item on today's plan into 2–3 distinct items. */
export async function splitPlanItem(
  v: Viewer,
  itemId: string,
  parts: { title: string; size?: PlanSize; minuteOfDay?: number }[],
): Promise<Edit> {
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
  const storedModel = (await getUserModel(v.db, v.user.id))?.model;
  for (const p of parts) {
    if (breaksGuardrails(p.title) || detectRisk(p.title) !== "none")
      return {
        ok: false,
        error: "Choose something without weight, diet or treatment advice.",
      };
    if (
      storedModel?.eatingConcern &&
      (mentionsFood(p.title) || mentionsExercise(p.title))
    )
      return {
        ok: false,
        error: "Choose something without food or exercise for today.",
      };
  }
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  const item = plan?.items.find((i) => i.stepId === itemId);
  if (!plan || !item)
    return { ok: true, changed: false, note: "That one is already gone." };
  if (plan.items.length - 1 + parts.length > 5)
    return {
      ok: false,
      error: "Your day already has five things. That is plenty.",
    };
  const splitItems: DayItem[] = parts.map((p, idx) => ({
    kind: item.kind,
    title: p.title.trim(),
    why: item.why,
    size:
      plan.energy === "low" || plan.mode === "lighter"
        ? "tiny"
        : (p.size ?? "small"),
    minuteOfDay:
      p.minuteOfDay ?? Math.min(item.minuteOfDay + idx * 45, LAST_MINUTE),
  }));
  const others = plan.items.filter((i) => i !== item);
  const items = spaceOut([...others, ...splitItems]);
  const note = `Split "${item.title}" into ${splitItems.map((s) => `"${s.title}"`).join(" and ")}.`;
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(note) ? null : note,
    origin: "talk",
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note }
    : { ok: true, changed: false, note: JUST_CHANGED };
}

/** Merges 2–4 items on today's plan into a single combined item. */
export async function mergePlanItems(
  v: Viewer,
  itemIds: string[],
  merged: { title: string; size?: PlanSize; minuteOfDay?: number },
): Promise<Edit> {
  if (await planEditPaused(v))
    return {
      ok: false,
      error: "Open Today to resume before changing your plan.",
    };
  const title = merged.title.trim();
  const storedModel = (await getUserModel(v.db, v.user.id))?.model;
  if (breaksGuardrails(title) || detectRisk(title) !== "none")
    return {
      ok: false,
      error: "Choose something without weight, diet or treatment advice.",
    };
  if (
    storedModel?.eatingConcern &&
    (mentionsFood(title) || mentionsExercise(title))
  )
    return {
      ok: false,
      error: "Choose something without food or exercise for today.",
    };
  await openToday(v.user.id, { db: v.db, today: v.today });
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (!plan) return { ok: false, error: "Today is not ready yet." };
  const idSet = new Set(itemIds);
  const matched = plan.items.filter((i) => i.stepId && idSet.has(i.stepId));
  if (matched.length < 2)
    return { ok: true, changed: false, note: "Those are already changed." };
  const first = [...matched].sort((a, b) => a.minuteOfDay - b.minuteOfDay)[0];
  const combined: DayItem = {
    kind: first.kind,
    title,
    why: first.why,
    size:
      plan.energy === "low" || plan.mode === "lighter"
        ? "tiny"
        : (merged.size ?? first.size),
    minuteOfDay: merged.minuteOfDay ?? first.minuteOfDay,
    ...(first.weekItemId ? { weekItemId: first.weekItemId } : {}),
  };
  const others = plan.items.filter((i) => !(i.stepId && idSet.has(i.stepId)));
  const items = [...others, combined].sort(
    (a, b) => a.minuteOfDay - b.minuteOfDay,
  );
  const note = `Combined ${matched
    .slice(0, 2)
    .map((m) => `"${m.title}"`)
    .join(" and ")} into "${title}".`;
  const written = await writePlanVersion(v.db, v.user.id, {
    day: v.today,
    items,
    energy: plan.energy,
    mode: plan.mode,
    reason: "add",
    note: breaksGuardrails(note) ? null : note,
    origin: "talk",
    expectVersion: plan.version + 1,
  });
  return written.ok
    ? { ok: true, changed: true, note }
    : { ok: true, changed: false, note: JUST_CHANGED };
}
