import { librarySmaller } from "./activities";
import type { IntakeModel } from "./intake";
import {
  assignTimes,
  breaksGuardrails,
  candidatesFor,
  checkComposition,
  coreKinds,
  fallbackPlan,
  LAST_MINUTE,
  mentionsExercise,
  mentionsFood,
  planMenu,
  seedOf,
  usableNames,
  wakeStart,
  whyFor,
  type CompositionContext,
  type PlanItem,
  type PlanKind,
  type PlanSize,
} from "./plan-menu";
import { detectRisk, normalise as normaliseTitle } from "./safety";
import type { Outcome } from "./steps";
import { daysBetween } from "./time";

// Everything about a day's plan that needs no database and no model: sizes,
// the rules-based adaptations that stand in when the model is off or wrong,
// the diff shown after a change, and the check that repairs a model's plan.
// UNREVIEWED: engineering defaults; a clinician has not reviewed the wording.

/** A planned item as stored in a plan version: the step it belongs to is optional until saved. */
export type DayItem = PlanItem & { stepId?: string };

const sizeOrder: PlanSize[] = ["tiny", "small", "medium"];
export const smallerSize = (s: PlanSize): PlanSize =>
  sizeOrder[Math.max(0, sizeOrder.indexOf(s) - 1)];
export const largerSize = (s: PlanSize): PlanSize =>
  sizeOrder[Math.min(sizeOrder.length - 1, sizeOrder.indexOf(s) + 1)];
export const sizeRank = (s: PlanSize) => sizeOrder.indexOf(s);

// --- The size rule -----------------------------------------------------------

/** One past answer for a kind of item. */
export type KindOutcome = {
  kind: PlanKind;
  size: PlanSize;
  outcome: Outcome;
  day: string;
};

/**
 * The size an item of this kind should have next time. Step up only after
 * the last one of that kind was completed at the current size; step down
 * after two misses in a row; never move on the first day.
 */
export function nextSize(a: {
  kind: PlanKind;
  current: PlanSize;
  history: KindOutcome[];
  firstDay: boolean;
}): PlanSize {
  if (a.firstDay) return a.current;
  const mine = a.history
    .filter((h) => h.kind === a.kind && h.outcome !== "skip")
    .sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0));
  const [last, before] = mine;
  if (last?.outcome === "not" && before?.outcome === "not")
    return smallerSize(a.current);
  if (last?.outcome === "done" && last.size === a.current)
    return largerSize(a.current);
  return a.current;
}

// --- Candidates at a size ----------------------------------------------------

type Candidate = Omit<PlanItem, "minuteOfDay">;

/** Every item Koe could offer for a kind at a size (medium included). */
export function candidatesAt(
  kind: PlanKind,
  size: PlanSize,
  model: IntakeModel,
): Candidate[] {
  if (size !== "medium")
    return candidatesFor(kind, model).filter((c) => c.size === size);
  const out: Candidate[] = [];
  for (const e of planMenu[kind].examples.medium) {
    if (model.eatingConcern && (e.food || e.exercise)) continue;
    if (kind === "reach_out") {
      for (const name of usableNames(model))
        out.push({
          kind,
          title: e.title.replace("{name}", name),
          why: `Because you named ${name} as someone in your corner`,
          size,
        });
      continue;
    }
    out.push({ kind, title: e.title, why: whyFor(kind, model), size });
  }
  return out;
}

const stripId = ({ stepId: _unused, ...rest }: DayItem): PlanItem => {
  void _unused;
  return rest;
};

/** The same item at a smaller size, or null when it is already as small as it gets. */
export function smallerVersion(
  item: DayItem,
  model: IntakeModel,
): DayItem | null {
  if (item.size === "tiny") {
    const lib = librarySmaller(item.title);
    return lib && !breaksGuardrails(lib)
      ? { ...stripId(item), title: lib }
      : null;
  }
  const avoid = normaliseTitle(item.title);
  for (let size = smallerSize(item.size); ; size = smallerSize(size)) {
    const list = candidatesAt(item.kind, size, model).filter(
      (c) => normaliseTitle(c.title) !== avoid,
    );
    // Prefer the same reason (the same interest or person) as the original.
    const pick = list.find((c) => c.why === item.why) ?? list[0];
    if (pick) return { ...stripId(item), title: pick.title, size };
    if (size === "tiny") break;
  }
  const lib = librarySmaller(item.title);
  return lib && !breaksGuardrails(lib)
    ? { ...stripId(item), title: lib, size: smallerSize(item.size) }
    : null;
}

/** The smallest version we can offer: keeps shrinking until tiny or stuck. */
function toTiny(item: DayItem, model: IntakeModel): DayItem {
  let cur = item;
  for (let guard = 0; guard < 3 && cur.size !== "tiny"; guard++) {
    const next = smallerVersion(cur, model);
    if (!next || next.size === cur.size) break;
    cur = next;
  }
  return cur;
}

/** A different item of the same kind at the same size, for "swap". Keeps the time. */
export function swapVersion(
  item: DayItem,
  model: IntakeModel,
  taken: string[] = [],
): DayItem | null {
  const avoid = new Set([item.title, ...taken].map(normaliseTitle));
  for (const size of [item.size, smallerSize(item.size)]) {
    const list = candidatesAt(item.kind, size, model).filter(
      (c) => !avoid.has(normaliseTitle(c.title)),
    );
    if (list.length)
      return { ...stripId(item), title: list[0].title, why: list[0].why, size };
  }
  return null;
}

// --- Rules-based adaptations (used when the model is off or wrong) -----------

/** Kinds Koe lets go of first when a day is made lighter. */
const dropOrder: PlanKind[] = [
  "problem",
  "work_chunk",
  "move",
  "outside",
  "reach_out",
  "kind",
  "wind_down",
  "task",
  "enjoy",
  "basics",
  "care",
];

/** The one item a lighter day always keeps: the basics, else what used to lift them. */
export function pickAnchor(items: DayItem[], locked: Set<string>): number {
  const free = (i: number) => !(items[i].stepId && locked.has(items[i].stepId));
  const idx = (pred: (x: DayItem) => boolean) =>
    items.findIndex((x, i) => free(i) && pred(x));
  const found = [
    idx((x) => x.kind === "basics"),
    idx((x) => x.kind === "enjoy"),
    idx((x) => coreKinds.includes(x.kind)),
    idx(() => true),
  ].find((i) => i >= 0);
  return found ?? 0;
}

const isLocked = (i: DayItem, locked: Set<string>) =>
  !!i.stepId && locked.has(i.stepId);

/** Drops the least important free items until at most `max` remain. */
function dropTo(
  items: DayItem[],
  max: number,
  locked: Set<string>,
  keep: DayItem[],
): DayItem[] {
  let out = [...items];
  while (out.length > max) {
    const candidates = out.filter(
      (x) => !isLocked(x, locked) && !keep.includes(x),
    );
    if (!candidates.length) break;
    const drop = candidates.sort(
      (a, b) => dropOrder.indexOf(a.kind) - dropOrder.indexOf(b.kind),
    )[0];
    out = out.filter((x) => x !== drop);
  }
  return out;
}

/**
 * On a low or lighter day one anchor always stays: the basics item or the
 * thing they used to enjoy. If a model dropped both, the anchor from the
 * current plan comes back tiny, in place of the least important free item.
 */
export function keepAnchor(
  items: DayItem[],
  current: DayItem[],
  locked: Set<string>,
  model: IntakeModel,
): DayItem[] {
  const isAnchor = (x: DayItem) => x.kind === "basics" || x.kind === "enjoy";
  if (items.some(isAnchor)) return items;
  const from = current.find(isAnchor);
  if (!from) return items;
  const back = toTiny(from, model);
  if (items.length < 3) return [...items, back];
  const free = items.filter((x) => !isLocked(x, locked));
  if (!free.length) return items;
  const drop = [...free].sort(
    (a, b) => dropOrder.indexOf(a.kind) - dropOrder.indexOf(b.kind),
  )[0];
  return items.map((x) => (x === drop ? back : x));
}

/**
 * Low energy, without a model: every free item one size smaller (tiny is the
 * floor), then at most three items, always keeping one anchor.
 */
export function adaptLow(
  items: DayItem[],
  model: IntakeModel,
  locked: Set<string> = new Set(),
): DayItem[] {
  const shrunk = items.map((x) =>
    isLocked(x, locked) ? x : (smallerVersion(x, model) ?? x),
  );
  // A tiny item that cannot get smaller stays as it was, with its own step.
  const same = shrunk.map((x, i) =>
    x.title === items[i].title && x.size === items[i].size ? items[i] : x,
  );
  const anchor = same[pickAnchor(same, locked)];
  const enjoy = same.find((x) => x.kind === "enjoy" && !isLocked(x, locked));
  return dropTo(same, 3, locked, [anchor, ...(enjoy ? [enjoy] : [])]);
}

/**
 * "More than usual", without a model: at most one item steps up, and only a
 * kind whose last item was done at its current size. Never on the first day.
 */
export function adaptMore(
  items: DayItem[],
  model: IntakeModel,
  history: KindOutcome[],
  firstDay: boolean,
  locked: Set<string> = new Set(),
): DayItem[] {
  if (firstDay) return items;
  const at = [...items]
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay)
    .findIndex((x) => {
      if (isLocked(x, locked) || x.size === "medium") return false;
      return (
        nextSize({
          kind: x.kind,
          current: x.size,
          history,
          firstDay,
        }) !== x.size
      );
    });
  if (at < 0) return items;
  const target = [...items].sort((a, b) => a.minuteOfDay - b.minuteOfDay)[at];
  const bigger = candidatesAt(target.kind, largerSize(target.size), model).find(
    (c) => c.why === target.why,
  );
  const pick =
    bigger ?? candidatesAt(target.kind, largerSize(target.size), model)[0];
  if (!pick) return items;
  return items.map((x) =>
    x === target
      ? { ...stripId(x), title: pick.title, why: pick.why, size: pick.size }
      : x,
  );
}

/**
 * A lighter day, without a model: one anchor and one more tiny item. Done
 * items stay (and count toward the two).
 */
export function adaptLighter(
  items: DayItem[],
  model: IntakeModel,
  locked: Set<string> = new Set(),
): DayItem[] {
  const keptLocked = items.filter((x) => isLocked(x, locked));
  if (keptLocked.length >= 2) return keptLocked;
  const free = items.filter((x) => !isLocked(x, locked));
  const anchorAt = pickAnchor(free, locked);
  const anchor = free[anchorAt];
  const others = free
    .filter((_, i) => i !== anchorAt)
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  const picked = [
    ...(anchor ? [toTiny(anchor, model)] : []),
    ...others
      .slice(0, Math.max(0, 2 - keptLocked.length - 1))
      .map((x) => toTiny(x, model)),
  ];
  return [...keptLocked, ...picked].sort(
    (a, b) => a.minuteOfDay - b.minuteOfDay,
  );
}

/**
 * Today's plan for a day after the first, without a model: the same kinds as
 * the first day, each at the size the history allows, with the wording
 * rotating a little from day to day.
 */
export function plainDay(
  model: IntakeModel,
  a: { day: string; history: KindOutcome[] },
): DayItem[] {
  const turn = Math.abs(daysBetween("2026-01-05", a.day));
  return fallbackPlan(model).map((item) => {
    const size = nextSize({
      kind: item.kind,
      current: item.size,
      history: a.history,
      firstDay: false,
    });
    const list = candidatesAt(item.kind, size, model);
    if (!list.length) return item;
    const pick = list[(seedOf(model) + turn) % list.length];
    return { ...item, title: pick.title, why: pick.why, size };
  });
}

// --- Lighter-day trigger -----------------------------------------------------

/**
 * Two earlier days in a row had a plan and nothing was done or partly done:
 * today starts lighter. `previous` is newest first.
 */
export function shouldGoLighter(
  previous: { day: string; active: number }[],
): boolean {
  return (
    previous.length >= 2 && previous[0].active === 0 && previous[1].active === 0
  );
}

// --- Moving later ------------------------------------------------------------

export type LaterOption = { label: string; minute: number };

/** "In an hour", "This afternoon", "This evening": only times after the item's own. */
export function laterOptions(minute: number): LaterOption[] {
  const all: LaterOption[] = [
    { label: "In an hour", minute: minute + 60 },
    { label: "This afternoon", minute: 15 * 60 },
    { label: "This evening", minute: 19 * 60 },
  ];
  const out: LaterOption[] = [];
  for (const o of all) {
    if (o.minute <= minute + 30 || o.minute > LAST_MINUTE) continue;
    if (out.some((x) => Math.abs(x.minute - o.minute) < 45)) continue;
    out.push(o);
  }
  return out;
}

// --- Diff --------------------------------------------------------------------

export type PlanDiff = {
  swapped: { from: DayItem; to: DayItem }[];
  shrunk: { from: DayItem; to: DayItem }[];
  grown: { from: DayItem; to: DayItem }[];
  added: DayItem[];
  removed: DayItem[];
  moved: { item: DayItem; from: number; to: number }[];
};

export const isEmptyDiff = (d: PlanDiff) =>
  !d.swapped.length &&
  !d.shrunk.length &&
  !d.grown.length &&
  !d.added.length &&
  !d.removed.length &&
  !d.moved.length;

/** What changed between two versions of a day. Pure; matches items by step, then by kind. */
export function diffPlans(a: DayItem[], b: DayItem[]): PlanDiff {
  const out: PlanDiff = {
    swapped: [],
    shrunk: [],
    grown: [],
    added: [],
    removed: [],
    moved: [],
  };
  const left = [...a];
  const pairs: [DayItem, DayItem][] = [];
  const take = (y: DayItem, test: (x: DayItem) => boolean) => {
    const i = left.findIndex(test);
    if (i < 0) return false;
    pairs.push([left.splice(i, 1)[0], y]);
    return true;
  };
  let rest = b.filter(
    (y) => !(y.stepId && take(y, (x) => x.stepId === y.stepId)),
  );
  rest = rest.filter(
    (y) => !take(y, (x) => x.kind === y.kind && x.title === y.title),
  );
  rest = rest.filter((y) => !take(y, (x) => x.kind === y.kind));

  for (const [x, y] of pairs) {
    if (x.title === y.title && x.size === y.size) {
      if (x.minuteOfDay !== y.minuteOfDay)
        out.moved.push({ item: y, from: x.minuteOfDay, to: y.minuteOfDay });
    } else if (sizeRank(y.size) < sizeRank(x.size)) {
      out.shrunk.push({ from: x, to: y });
    } else if (sizeRank(y.size) > sizeRank(x.size)) {
      out.grown.push({ from: x, to: y });
    } else {
      out.swapped.push({ from: x, to: y });
    }
  }
  // What is left on both sides is a different kind taking the place of another.
  const n = Math.min(left.length, rest.length);
  for (let i = 0; i < n; i++) out.swapped.push({ from: left[i], to: rest[i] });
  out.removed.push(...left.slice(n));
  out.added.push(...rest.slice(n));
  return out;
}

/** The compact list under the note: "Walk 20 min → Step outside 5 min". */
export function diffLines(d: PlanDiff, clock: (m: number) => string): string[] {
  return [
    ...d.shrunk.map((x) => `${x.from.title} → ${x.to.title}`),
    ...d.swapped.map((x) => `${x.from.title} → ${x.to.title}`),
    ...d.grown.map((x) => `${x.from.title} → ${x.to.title}`),
    ...d.moved.map((x) => `${x.item.title}: ${clock(x.from)} → ${clock(x.to)}`),
    ...d.added.map((x) => `Added: ${x.title}`),
    ...d.removed.map((x) => `Taken off today: ${x.title}`),
  ];
}

export type NoteContext = {
  reason: string;
  energy?: "low" | "okay" | "more" | null;
};

/** Koe's one line about a change when the model gave none (or its line failed a check).
 * No pronouns: outside Talk, Koe does not say "I" (UX-AND-COPY.md). */
export function templateNote(d: PlanDiff, ctx: NoteContext): string {
  if (isEmptyDiff(d))
    return ctx.reason === "check_in" && ctx.energy === "low"
      ? "Your plan already fits a low day."
      : "Your plan already fits today.";
  const sentences = [
    ...d.shrunk.map((x) => `Swapped "${x.from.title}" for "${x.to.title}".`),
    ...d.swapped.map((x) => `Swapped "${x.from.title}" for "${x.to.title}".`),
    ...d.grown.map((x) => `Stepped "${x.from.title}" up to "${x.to.title}".`),
    ...d.removed.map((x) => `Took "${x.title}" off today.`),
    ...d.added.map((x) => `Added "${x.title}".`),
    ...d.moved.map((x) => `Moved "${x.item.title}" to a different time.`),
  ];
  const lighter =
    ctx.reason === "lighter" ||
    ctx.reason === "first_lighter" ||
    (ctx.reason === "check_in" && ctx.energy === "low");
  const more = sentences.length - 2;
  return (
    (lighter ? "Lighter day: " : "") +
    sentences.slice(0, 2).join(" ") +
    (more > 0 ? ` And ${more} more ${more === 1 ? "change" : "changes"}.` : "")
  );
}

// --- Repairing a model's plan -------------------------------------------------

const riskyText = (t: string) =>
  breaksGuardrails(t) || detectRisk(t) !== "none";

function spread(
  items: DayItem[],
  locked: Set<string>,
  model: IntakeModel,
): DayItem[] {
  const start = wakeStart(model.wake);
  const sorted = [...items]
    .map((x) =>
      isLocked(x, locked)
        ? x
        : {
            ...x,
            minuteOfDay: Math.min(Math.max(x.minuteOfDay, start), LAST_MINUTE),
          },
    )
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].minuteOfDay;
    if (!isLocked(sorted[i], locked) && sorted[i].minuteOfDay < prev + 45)
      sorted[i] = {
        ...sorted[i],
        minuteOfDay: Math.min(prev + 45, LAST_MINUTE),
      };
  }
  return sorted.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}

/**
 * Checks a model's proposed day against the same rules as the rules-based
 * plan and replaces only what breaks them: words that trip a guardrail or
 * the safety rules, times outside waking hours, and anything the composition
 * rules refuse. Done items are always kept. Returns null if it cannot be
 * repaired, and the caller uses the rules-based plan instead.
 */
export function repairDayPlan(a: {
  proposed: DayItem[];
  current: DayItem[];
  locked: Set<string>;
  model: IntakeModel;
  ctx: CompositionContext;
}): { items: DayItem[]; replaced: number } | null {
  const { current, locked, model, ctx } = a;
  const eating = model.eatingConcern;
  let replaced = 0;
  const pool: DayItem[] = [
    ...fallbackPlan(model),
    ...current.filter((x) => !isLocked(x, locked)).map(stripId),
  ];

  const badWords = (x: DayItem) =>
    riskyText(x.title) ||
    riskyText(x.why) ||
    (eating &&
      (mentionsFood(x.title + " " + x.why) ||
        mentionsExercise(x.title + " " + x.why)));

  const pick = (
    items: DayItem[],
    index: number,
    want?: (k: PlanKind) => boolean,
    maxSize?: PlanSize,
  ) => {
    const others = items.filter((_, j) => j !== index);
    const ok = (p: DayItem) =>
      !badWords(p) &&
      (!want || want(p.kind)) &&
      (!maxSize || sizeRank(p.size) <= sizeRank(maxSize)) &&
      !others.some((o) => normaliseTitle(o.title) === normaliseTitle(p.title));
    return (
      pool.find((p) => ok(p) && !others.some((o) => o.kind === p.kind)) ??
      pool.find(ok) ??
      null
    );
  };
  const swapIn = (items: DayItem[], index: number, r: DayItem): DayItem[] =>
    items.map((x, i) =>
      i === index ? { ...stripId(r), minuteOfDay: x.minuteOfDay } : x,
    );

  let items: DayItem[] = a.proposed.map((x) => ({ ...x }));

  // Words first.
  for (let i = 0; i < items.length; i++) {
    if (isLocked(items[i], locked) || !badWords(items[i])) continue;
    const r = pick(items, i, (k) => k === items[i].kind) ?? pick(items, i);
    if (!r) return null;
    items = swapIn(items, i, r);
    replaced++;
  }

  // Done items always stay.
  for (const c of current)
    if (isLocked(c, locked) && !items.some((x) => x.stepId === c.stepId))
      items.push(c);

  items = spread(items, locked, model);

  for (let guard = 0; guard < 10; guard++) {
    const found = checkComposition(items, ctx);
    if (!found.length) return { items, replaced };
    const first = found[0];
    const at = found.find(
      (v) => v.index !== undefined && !isLocked(items[v.index!], locked),
    );
    if (at) {
      const index = at.index!;
      const r = pick(
        items,
        index,
        undefined,
        at.code === "size" ? "small" : undefined,
      );
      if (!r) return null;
      items = swapIn(items, index, r);
      replaced++;
      continue;
    }
    if (first.code === "count") {
      if (items.length > (ctx.lighter ? 3 : 5)) {
        const kept = dropTo(items, ctx.lighter ? 3 : 5, locked, [
          items[pickAnchor(items, locked)],
        ]);
        if (kept.length === items.length) return null;
        replaced += items.length - kept.length;
        items = kept;
      } else {
        const have = new Set(items.map((x) => x.kind));
        const extra = pool.find(
          (p) =>
            !have.has(p.kind) &&
            !badWords(p) &&
            checkComposition([...items, p], ctx).every(
              (v) => v.code === "count" || v.index === undefined,
            ),
        );
        if (!extra) return null;
        const t = assignTimes(
          [...items.map((x) => x.kind), extra.kind],
          model.wake,
        );
        items = spread(
          [...items, { ...stripId(extra), minuteOfDay: t[t.length - 1] }],
          locked,
          model,
        );
        replaced++;
      }
      continue;
    }
    if (first.code === "no_lift") {
      const index = items.findLastIndex(
        (x) => !isLocked(x, locked) && !coreKinds.includes(x.kind),
      );
      const r = index < 0 ? null : pick(items, index, (k) => k === "enjoy");
      if (!r) return null;
      items = swapIn(items, index, r);
      replaced++;
      continue;
    }
    if (first.code === "no_core") {
      const index = items.findLastIndex(
        (x) => !isLocked(x, locked) && x.kind !== "enjoy",
      );
      const r =
        index < 0
          ? null
          : pick(items, index, (k) => coreKinds.includes(k) || k === "enjoy");
      if (!r) return null;
      items = swapIn(items, index, r);
      replaced++;
      continue;
    }
    return null;
  }
  return null;
}

/**
 * Energy and mode limits a model's day must respect, enforced in code:
 * on a low day every free item is smaller than before (tiny is the floor)
 * and new items are tiny; on a lighter day changed items are tiny;
 * on any other day nothing grows unless the size rule allows it, and at
 * most one item grows. Items that break a limit are put back or replaced
 * with the rules-based version.
 */
export function constrainSizes(a: {
  items: DayItem[];
  current: DayItem[];
  locked: Set<string>;
  model: IntakeModel;
  mode: "low" | "lighter" | "more" | "keep";
  history: KindOutcome[];
  firstDay: boolean;
}): DayItem[] {
  const { current, locked, model } = a;
  let grown = 0;
  return a.items.map((x) => {
    if (isLocked(x, locked)) return x;
    const before = current.find((c) => c.stepId && c.stepId === x.stepId);
    if (a.mode === "low") {
      // Anything new on a low day starts tiny, so a swap can't keep the day as big.
      if (!before) return x.size === "tiny" ? x : toTiny(x, model);
      if (sizeRank(x.size) >= sizeRank(before.size) && before.size !== "tiny")
        return smallerVersion(before, model) ?? before;
      return sizeRank(x.size) > sizeRank(before.size) ? before : x;
    }
    if (a.mode === "lighter") {
      const changed = !before || before.title !== x.title;
      return changed && x.size !== "tiny" ? toTiny(x, model) : x;
    }
    // more / keep: growth only where the size rule allows it, once.
    if (before && sizeRank(x.size) > sizeRank(before.size)) {
      const allowed =
        a.mode === "more" &&
        grown === 0 &&
        !a.firstDay &&
        nextSize({
          kind: before.kind,
          current: before.size,
          history: a.history,
          firstDay: a.firstDay,
        }) === x.size;
      if (allowed) {
        grown++;
        return x;
      }
      return before;
    }
    // A new item is small unless the history already earns a medium one.
    if (!before && x.size === "medium") {
      const earned =
        !a.firstDay &&
        nextSize({
          kind: x.kind,
          current: "small",
          history: a.history,
          firstDay: false,
        }) === "medium";
      return earned ? x : (smallerVersion(x, model) ?? x);
    }
    return x;
  });
}
