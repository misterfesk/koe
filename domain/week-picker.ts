import type { DayItem } from "./day-plan";
import type { IntakeModel } from "./intake";
import {
  assignTimes,
  candidatesFor,
  chooseKinds,
  LAST_MINUTE,
  pickFirst,
  wakeStart,
  type PlanItem,
  type PlanKind,
} from "./plan-menu";
import type { Energy } from "./steps";

// Today's plan from This week things (v3 A3): the things in a fixed order,
// one anchor, times and why lines from templates. Pure, no AI.

/** One This week thing with what its plan entries have recorded so far. */
export type OpenThing = {
  id: string;
  title: string;
  what: string;
  when: string;
  position: number;
  /** Times it was answered Partly. */
  partly: number;
  /** Times it was answered Not today (or skipped). */
  notToday: number;
  done: boolean;
};

/** How many things a day holds: low or lighter 1, ordinary 2, more 3. */
export function thingCount(energy: Energy | null, lighter: boolean): number {
  if (lighter || energy === "low") return 1;
  return energy === "more" ? 3 : 2;
}

/**
 * Open things in the order they come into a day: fewer Not today first, then
 * ones that moved (Partly) first, then the order the person gave them.
 */
export function pickThings(
  things: OpenThing[],
  energy: Energy | null,
  lighter: boolean,
): OpenThing[] {
  return things
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        a.notToday - b.notToday ||
        Number(b.partly > 0) - Number(a.partly > 0) ||
        a.position - b.position,
    )
    .slice(0, thingCount(energy, lighter));
}

const WHY_MAX = 120;
const WHY_START = 'Because you said "';

/** `Because you said "{what}"`, cut at a word so the line is at most 120 characters. */
export function thingWhy(what: string): string {
  const words = what.replace(/\s+/g, " ").trim();
  const room = WHY_MAX - WHY_START.length - 1;
  if (words.length <= room) return `${WHY_START}${words}"`;
  const head = words.slice(0, room);
  const space = head.lastIndexOf(" ");
  const cut = (space > 0 ? head.slice(0, space) : head.slice(0, room - 1))
    .replace(/[\s.,;:!?…—–-]+$/u, "")
    .slice(0, room - 1);
  return `${WHY_START}${cut}…"`;
}

/** Minutes after wake for the first, second and third thing. */
const THING_OFFSETS = [60, 150, 240];
const CLASH = 30;

/** Template start time for the thing in a given place in the day. */
export function thingMinute(place: number, wake?: IntakeModel["wake"]) {
  const offset = THING_OFFSETS[Math.min(place, THING_OFFSETS.length - 1)];
  return Math.min(wakeStart(wake) + offset, LAST_MINUTE);
}

/** Items closer than 30 minutes: the later one moves 30 minutes on. */
export function spaceOut(items: DayItem[]): DayItem[] {
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.minuteOfDay - b.item.minuteOfDay || a.i - b.i);
  let previous = -Infinity;
  return sorted.map(({ item }) => {
    const minute = Math.min(
      Math.max(item.minuteOfDay, previous + CLASH),
      LAST_MINUTE,
    );
    previous = minute;
    return minute === item.minuteOfDay
      ? item
      : { ...item, minuteOfDay: minute };
  });
}

/** The one anchor's kind: something they used to enjoy, else the first other kind of their day. */
export function anchorKind(model: IntakeModel): PlanKind {
  return chooseKinds(model).find((k) => k !== "task") ?? "basics";
}

function candidate(kind: PlanKind, model: IntakeModel, tiny: boolean) {
  const first = pickFirst(kind, model);
  if (!tiny || first?.size === "tiny") return first;
  return candidatesFor(kind, model).find((c) => c.size === "tiny") ?? first;
}

export type WeekDayInput = {
  things: OpenThing[];
  energy: Energy | null;
  lighter: boolean;
  model: IntakeModel;
  /** Today's plan so far, when re-planning after a check-in or "too much". */
  current?: DayItem[];
  /** Steps already answered Done or Partly today: they stay as they are. */
  locked?: Set<string>;
  /** Things let go for today: they come back tomorrow, not today. */
  skip?: Set<string>;
};

/**
 * Today's plan from This week things: the picked things, one anchor and, if
 * the person chose the basics and the day is not low, one basics entry.
 */
export function weekDay(a: WeekDayInput): DayItem[] {
  const current = a.current ?? [];
  const locked = a.locked ?? new Set<string>();
  const isLocked = (x: DayItem) => !!x.stepId && locked.has(x.stepId);
  const kept = current.filter(isLocked);
  const free = current.filter((x) => !isLocked(x));
  const keptThings = new Set(
    kept.flatMap((x) => (x.weekItemId ? [x.weekItemId] : [])),
  );
  const small = a.lighter || a.energy === "low";
  const wake = a.model.wake;

  const pool = a.things.filter(
    (t) => !keptThings.has(t.id) && !a.skip?.has(t.id),
  );
  const room = Math.max(0, thingCount(a.energy, a.lighter) - keptThings.size);
  const things = pickThings(pool, a.energy, a.lighter)
    .slice(0, room)
    .map(
      (t, place): DayItem =>
        free.find((x) => x.weekItemId === t.id) ?? {
          kind: "task",
          title: t.title,
          why: thingWhy(t.what),
          size: "small",
          minuteOfDay: thingMinute(place + keptThings.size, wake),
          weekItemId: t.id,
        },
    );

  const extra: DayItem[] = [];
  const add = (kind: PlanKind, tiny: boolean) => {
    const same = free.find(
      (x) => !x.weekItemId && x.kind === kind && (!tiny || x.size === "tiny"),
    );
    if (same) return void extra.push(same);
    const c = candidate(kind, a.model, tiny);
    if (c) extra.push({ ...c, minuteOfDay: assignTimes([kind], wake)[0] });
  };
  const anchor = anchorKind(a.model);
  if (!kept.some((x) => !x.weekItemId)) add(anchor, small);
  if (
    !small &&
    a.model.goals.includes("basics") &&
    anchor !== "basics" &&
    ![...kept, ...extra].some((x) => x.kind === "basics")
  )
    add("basics", false);

  return spaceOut([...kept, ...things, ...extra]);
}

/**
 * Day 1 when the intro also saves a week: the first two things (an ordinary
 * day) plus one anchor, the first intro item that is not a task, with its own
 * why line and time. Used by the reveal preview and by Start my day, so what
 * the person sees is what is saved. Things without an id yet (the preview)
 * carry no weekItemId.
 */
export function introDay(
  introItems: PlanItem[],
  things: { id?: string; captured: { what: string; title: string } }[],
  wake?: IntakeModel["wake"],
): PlanItem[] {
  if (!things.length) return introItems;
  const picked = things
    .slice(0, thingCount(null, false))
    .map((t, place): PlanItem => ({
      kind: "task",
      title: t.captured.title,
      why: thingWhy(t.captured.what),
      size: "small",
      minuteOfDay: thingMinute(place, wake),
      ...(t.id ? { weekItemId: t.id } : {}),
    }));
  const anchor = introAnchor(introItems);
  return spaceOut([...picked, ...(anchor ? [anchor] : [])]);
}

/**
 * The intro item standing in as the anchor on a week day 1, if any. The
 * anchor comes from what lifts the person when the intro has such an item;
 * otherwise the first item that is not work (the week covers work).
 */
export const introAnchor = (introItems: PlanItem[]) =>
  introItems.find((i) => i.kind === "enjoy") ??
  introItems.find((i) => i.kind !== "task" && i.kind !== "work_chunk") ??
  introItems.find((i) => i.kind !== "task") ??
  null;
