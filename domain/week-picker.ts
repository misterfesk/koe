import type { DayItem } from "./day-plan";
import type { IntakeModel } from "./intake";
import {
  assignTimes,
  breaksGuardrails,
  candidatesFor,
  chooseKinds,
  LAST_MINUTE,
  mentionsExercise,
  mentionsFood,
  pickFirst,
  wakeStart,
  type PlanItem,
  type PlanKind,
} from "./plan-menu";
import { detectRisk } from "./safety";
import type { Energy } from "./steps";

// Today's plan from This week things (v3 A3 + D037): the things in a fixed order,
// one anchor (shaped by saved memories or notes when present), times and why lines.
// Pure, no AI.

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

const WHY_WORDS = 8;

/**
 * `Because you said "{phrase}"`: the first clause of what they said, at most
 * eight words, cut at a word so the line is at most 120 characters.
 */
export function thingWhy(what: string): string {
  const said = what.replace(/\s+/g, " ").trim();
  const clause = said.split(/[.!?;:](?:\s|$)|,\s|\s[—–-]\s/u)[0].trim() || said;
  const all = clause.split(" ");
  const words =
    all.length > WHY_WORDS
      ? all
          .slice(0, WHY_WORDS)
          .join(" ")
          .replace(/[\s.,;:!?…—–-]+$/u, "") + "…"
      : clause;
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

const VERB_STARTERS = new Set([
  "walk",
  "listen",
  "read",
  "sit",
  "make",
  "draw",
  "stretch",
  "put",
  "play",
  "watch",
  "take",
  "write",
  "spend",
  "drink",
  "step",
  "go",
  "call",
  "message",
  "text",
  "open",
  "wash",
  "tidy",
  "review",
  "practice",
  "do",
]);

function startsWithVerb(s: string): boolean {
  const first = s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return VERB_STARTERS.has(first);
}

const GERUND_TO_VERB: Record<string, string> = {
  walking: "Walk",
  listening: "Listen",
  reading: "Read",
  sitting: "Sit",
  making: "Make",
  drawing: "Draw",
  stretching: "Stretch",
  putting: "Put",
  playing: "Play",
  watching: "Watch",
  taking: "Take",
  writing: "Write",
  spending: "Spend",
  drinking: "Drink",
  stepping: "Step",
  going: "Go",
  calling: "Call",
  messaging: "Message",
  texting: "Text",
};

function memoryTitle(raw: string, tiny: boolean): string | null {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  if (!cleaned) return null;
  if (startsWithVerb(cleaned) && cleaned.length <= 80) {
    return cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  const stripped = cleaned
    .replace(
      /^(you\s+(said|like|love|enjoy|prefer|find\s+that|chose\s+to)|that\s+|having\s+)/i,
      "",
    )
    .replace(
      /\s+(helps|helped|lifts|lifted|calms|calmed|clears|cleared|works|worked|is\s+good|makes\s+it\s+easier)\b.*$/i,
      "",
    )
    .trim()
    .replace(/[,.;:!?]+$/, "");
  if (!stripped) return null;
  if (startsWithVerb(stripped) && stripped.length <= 80) {
    return stripped[0].toUpperCase() + stripped.slice(1);
  }
  const firstWord = stripped.split(/\s+/)[0].toLowerCase();
  const rest = stripped.slice(firstWord.length).trim();
  if (GERUND_TO_VERB[firstWord]) {
    const built = `${GERUND_TO_VERB[firstWord]}${rest ? " " + rest : ""}`;
    if (built.length <= 80 && startsWithVerb(built)) return built;
  }
  const lower = stripped.toLowerCase();
  const prefix =
    /\b(music|song|playlist|album|jazz|lo-fi|lofi|podcast|radio)\b/.test(lower)
      ? "Put on"
      : /\b(tea|coffee|water|hot drink)\b/.test(lower)
        ? "Make"
        : tiny
          ? "Take two minutes for"
          : "Take ten minutes for";
  const phrase = `${prefix} ${lower}`.slice(0, 80).trim();
  return startsWithVerb(phrase) ? phrase : null;
}

/**
 * Turns a saved `helps` or `preference` memory card or recent note into the
 * daily anchor item when safe, so saved memories and notes visibly shape Today.
 */
export function memoryCandidate(
  fallbackKind: PlanKind,
  model: IntakeModel,
  memories: { kind: string; text: string }[] | undefined,
  notes: { kind?: string; text: string }[] | undefined,
  tiny: boolean,
): Omit<PlanItem, "minuteOfDay"> | null {
  const sources: { text: string }[] = [
    ...(memories ?? []).filter(
      (m) => m.kind === "helps" || m.kind === "preference",
    ),
    ...(notes ?? []),
  ];
  for (const s of sources) {
    const text = s.text?.trim();
    if (!text) continue;
    if (breaksGuardrails(text) || detectRisk(text) !== "none") continue;
    if (model.eatingConcern && (mentionsFood(text) || mentionsExercise(text)))
      continue;
    const title = memoryTitle(text, tiny);
    if (!title || breaksGuardrails(title) || detectRisk(title) !== "none")
      continue;
    if (model.eatingConcern && (mentionsFood(title) || mentionsExercise(title)))
      continue;
    const lower = title.toLowerCase();
    const kind: PlanKind =
      !model.eatingConcern && /\b(walk|stretch)\b/.test(lower)
        ? "move"
        : /\b(outside|balcony|garden|air|park)\b/.test(lower)
          ? "outside"
          : fallbackKind === "task"
            ? "enjoy"
            : fallbackKind;
    return {
      kind,
      title,
      why: thingWhy(text),
      size: tiny ? "tiny" : "small",
    };
  }
  return null;
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
  /** Saved memory cards when memory is on. */
  memories?: { kind: string; text: string }[];
  /** Recent saved notes when memory is on. */
  notes?: { kind?: string; text: string }[];
};

/**
 * Today's plan from This week things: the picked things, one anchor (shaped by
 * saved memories or notes when present) and, if the person chose the basics and
 * the day is not low, one basics entry.
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
  const add = (kind: PlanKind, tiny: boolean, useMemory = false) => {
    const same = free.find(
      (x) => !x.weekItemId && x.kind === kind && (!tiny || x.size === "tiny"),
    );
    if (same) return void extra.push(same);
    const c =
      (useMemory
        ? memoryCandidate(kind, a.model, a.memories, a.notes, tiny)
        : null) ?? candidate(kind, a.model, tiny);
    if (c)
      extra.push({
        ...c,
        minuteOfDay: assignTimes([c.kind], wake)[0],
      });
  };
  const anchor = anchorKind(a.model);
  if (!kept.some((x) => !x.weekItemId)) add(anchor, small, true);
  if (
    !small &&
    a.model.goals.includes("basics") &&
    anchor !== "basics" &&
    ![...kept, ...extra].some((x) => x.kind === "basics")
  )
    add("basics", false, false);

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
