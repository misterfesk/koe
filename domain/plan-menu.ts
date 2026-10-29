import { z } from "zod";
import {
  goalPhrases,
  hasLifts,
  liftPhrases,
  namedPeople,
  type IntakeModel,
  type Lift,
  type Wake,
} from "./intake";
import { normalise } from "./safety";
import type { Area } from "./steps";
import { formatMinutes } from "./time";

// The day plan menu: the single source of truth for what a day may contain.
// Prompts, the rules-based fallback and the checks are all generated from or
// run against this module, so they cannot drift apart.
// Evidence and the "never suggest" list: plan/product-v2.md section 2.
// UNREVIEWED: engineering defaults; a clinician has not reviewed the wording.

export const planKinds = [
  "enjoy",
  "task",
  "basics",
  "move",
  "outside",
  "reach_out",
  "problem",
  "wind_down",
  "kind",
  "work_chunk",
  "care",
] as const;
export type PlanKind = (typeof planKinds)[number];

export const planSizes = ["tiny", "small", "medium"] as const;
export type PlanSize = (typeof planSizes)[number];
export const sizeLabels: Record<PlanSize, string> = {
  tiny: "Tiny",
  small: "Small",
  medium: "Medium",
};

export const planOrigins = ["intro", "planner", "you", "talk"] as const;
export type PlanOrigin = (typeof planOrigins)[number];

export type Band = "morning" | "midday" | "evening";

/** `{name}` is replaced with a person the user named. */
type Example = { title: string; food?: true; exercise?: true };

type KindMeta = {
  /** What the person sees. */
  label: string;
  /** The v1 area, kept so older screens still work. */
  area: Area;
  band: Band;
  /** When the planner may pick this kind. */
  pick: string;
  examples: Record<PlanSize, Example[]>;
  /**
   * Kinds of action, as bare nouns for prompts. Prompts use these instead of
   * the example sentences, which models copy word for word.
   */
  ideas: string;
  /** The size used first. Everything is tiny or small on the first day. */
  preferred: PlanSize;
};

export const planMenu: Record<PlanKind, KindMeta> = {
  enjoy: {
    label: "Something you used to enjoy",
    area: "enjoy",
    band: "evening",
    pick: "Always one when the person said something used to lift them (never promise enjoyment); if nothing did, one small thing to try and see. Afternoon or evening.",
    preferred: "tiny",
    ideas:
      "music, a record, a show, a game, a craft, a pet, a book, time somewhere they like",
    examples: {
      tiny: [
        { title: "Put on one song you used to like" },
        { title: "Spend two minutes on something you used to enjoy" },
      ],
      small: [{ title: "Spend ten minutes on something you used to enjoy" }],
      medium: [{ title: "Go out for 30 minutes to somewhere you like" }],
    },
  },
  task: {
    label: "A small job",
    area: "do",
    band: "morning",
    pick: "When the person named a job they keep putting off or are stuck on. Morning.",
    preferred: "tiny",
    ideas:
      "a letter, an email, a form, a call, one chore, the first small part of a stuck job",
    examples: {
      tiny: [
        { title: "Open the letter or message you have been avoiding" },
        { title: "Write down the very first thing to do on one job" },
      ],
      small: [
        { title: "Spend ten minutes on the first small part of one job" },
      ],
      medium: [{ title: "Work on one job for a 25-minute block" }],
    },
  },
  basics: {
    label: "Look after the basics",
    area: "care",
    band: "morning",
    pick: "When the person asked for help with the basics, or on the lowest energy. Morning.",
    preferred: "tiny",
    ideas:
      "water, washing, clothes, a drink or snack, tidying a corner, a shower, laundry",
    examples: {
      tiny: [
        { title: "Drink a glass of water" },
        { title: "Wash your face" },
        { title: "Eat something, anything small", food: true },
      ],
      small: [
        { title: "Wash your face and change into fresh clothes" },
        { title: "Open the curtains and tidy one small corner" },
        { title: "Make a simple meal", food: true },
      ],
      medium: [{ title: "Shower and put one load of washing on" }],
    },
  },
  move: {
    label: "Move a little",
    area: "move",
    band: "morning",
    pick: "Unless the person said no, and never when food or weight worry is flagged. Morning or midday.",
    preferred: "tiny",
    ideas: "stretching, shoulders, a short walk, moving in a way they choose",
    examples: {
      tiny: [
        { title: "Stretch for two minutes", exercise: true },
        {
          title: "Stand up and roll your shoulders for a minute",
          exercise: true,
        },
      ],
      small: [{ title: "Take a ten-minute walk", exercise: true }],
      medium: [
        { title: "Move for 20 minutes in a way you choose", exercise: true },
      ],
    },
  },
  outside: {
    label: "Get some fresh air",
    area: "move",
    band: "midday",
    pick: "Daytime, when the person can go out; pairs well with moving or something enjoyed. Never as light therapy.",
    preferred: "tiny",
    ideas:
      "a window, the doorstep, the balcony, a bench, a park, a hot drink outdoors",
    examples: {
      tiny: [
        { title: "Open a window for a minute" },
        { title: "Stand at the door for a few breaths of outside air" },
      ],
      small: [
        { title: "Step outside for ten minutes" },
        { title: "Sit outside with a hot drink for ten minutes" },
      ],
      medium: [{ title: "Spend 20 minutes in a green space" }],
    },
  },
  reach_out: {
    label: "Reach out to someone",
    area: "connect",
    band: "midday",
    pick: "Only when the person named someone safe. Midday or evening. One at most.",
    preferred: "small",
    ideas:
      "a reaction, a short hello, one low-stakes message, a call or meet-up with the named person",
    examples: {
      tiny: [{ title: "Send {name} a thumbs-up" }],
      small: [
        { title: "Send {name} a short hello" },
        { title: "Send {name} one low-stakes message" },
      ],
      medium: [{ title: "Call or meet {name}" }],
    },
  },
  problem: {
    label: "Untangle one problem",
    area: "do",
    band: "midday",
    pick: "A recurring practical block; not on the lowest energy. Midday.",
    preferred: "tiny",
    ideas: "naming it, listing options, picking one and what to do first",
    examples: {
      tiny: [{ title: "Name the problem in one line" }],
      small: [{ title: "Write down two or three options and pick one" }],
      medium: [{ title: "Pick one option and write down what to do first" }],
    },
  },
  wind_down: {
    label: "Sleep and waking",
    area: "care",
    band: "evening",
    pick: "When the person asked about sleep. Evening, or one morning anchor.",
    preferred: "tiny",
    ideas: "dimmer lights, phone away, something quiet, a steady wake time",
    examples: {
      tiny: [
        { title: "Dim the lights and put your phone down for a few minutes" },
        { title: "Aim to wake in the same hour tomorrow" },
      ],
      small: [{ title: "Spend ten minutes on something quiet before bed" }],
      medium: [{ title: "Spend 30 minutes winding down with something quiet" }],
    },
  },
  kind: {
    label: "Be kind to yourself",
    area: "care",
    band: "evening",
    pick: "Optional on hard days or after something did not go to plan.",
    preferred: "tiny",
    ideas: "one line a friend would say, a short break",
    examples: {
      tiny: [{ title: "Say one line to yourself that a friend would say" }],
      small: [{ title: "Take a three-minute break to be kind to yourself" }],
      medium: [{ title: "Do something kind for yourself for 20 minutes" }],
    },
  },
  work_chunk: {
    label: "Work or study, then a break",
    area: "do",
    band: "midday",
    pick: "When the person mentioned work or study. Midday.",
    preferred: "small",
    ideas: "opening the document, a short timed block, then a break",
    examples: {
      tiny: [{ title: "Open the document you need to work on" }],
      small: [{ title: "Work for 15 minutes, then take a 5-minute break" }],
      medium: [{ title: "Work for 25 minutes, then take a break" }],
    },
  },
  care: {
    label: "Talk to someone who can help",
    area: "care",
    band: "midday",
    pick: "When a plan is not enough, the person has no care in place, or they asked.",
    preferred: "tiny",
    ideas: "noting a question for a doctor, drafting an appointment message",
    examples: {
      tiny: [{ title: "Note one question you would like to ask a doctor" }],
      small: [{ title: "Draft a message to book an appointment" }],
      medium: [{ title: "Book a time to see someone who can help" }],
    },
  },
};

export const kindAreas: Record<PlanKind, Area> = Object.fromEntries(
  planKinds.map((k) => [k, planMenu[k].area]),
) as Record<PlanKind, Area>;

export const kindLabel = (kind: PlanKind) => planMenu[kind].label;

/** A kind from stored text, or null for older rows and unknown values. */
export function asKind(value: string | null | undefined): PlanKind | null {
  return (planKinds as readonly string[]).includes(value ?? "")
    ? (value as PlanKind)
    : null;
}

export type PlanItem = {
  kind: PlanKind;
  title: string;
  /** Second person: "Because you said music used to lift you". */
  why: string;
  size: PlanSize;
  /** Minutes after local midnight. */
  minuteOfDay: number;
  /** Set when the entry is one of the person's This week things. */
  weekItemId?: string;
};

export const planItemSchema = z.object({
  kind: z.enum(planKinds),
  title: z.string().trim().min(3).max(80),
  why: z.string().trim().min(3).max(120),
  size: z.enum(planSizes),
  minuteOfDay: z.number().int().min(0).max(1439),
});

// --- Never suggest -----------------------------------------------------------

/** The "Never suggest" list as prose, for prompts. */
export const neverSuggest = [
  "weight, calories, diets, fasting, food tracking, or exercise as compensation for eating",
  'light boxes or lamps, or any claim that "sunlight treats depression"',
  "sleep restriction, staying up late, rigid bedtime rules, or bedtime reminders and alarms",
  "expressive writing, relaxation or meditation add-ons, positive self-statements or affirmations, gratitude lists, or intensive mood logging",
  "supplements, vitamins, medication, doses or alcohol",
  "work or study decisions such as quitting or what to tell an employer",
  "guessing at a diagnosis, or naming a condition the person might have",
  'effect sizes, clinical claims, or promises such as "this will make you feel better" or "you will enjoy it"',
  'streaks, "you missed", backlog or catching up',
  'the words "we", "us", "together" and "let\'s": Koe speaks to the person as "you"',
] as const;

// Conservative on purpose: a false hit swaps one item for a safe one; a miss
// puts forbidden advice in front of someone who is struggling.
const guardrails: [string, RegExp][] = [
  [
    "weight",
    /\bweight\b|\bweigh(ing)? (yourself|in)\b|\bbmi\b|\bbody (fat|image)\b/,
  ],
  ["calories", /\bcalor(ie|ies|ic)\b|\bmacros?\b|\bkcal\b/],
  ["diet", /\bdiet(s|ing|ary)?\b/],
  ["fasting", /\bfasting\b|\bintermittent fast/],
  [
    "skip meals",
    /\bskip(ping|ped|s)? (a |your |the |some )?(meals?|breakfast|lunch|dinner)\b/,
  ],
  ["burn", /\bburn(ing|s|ed|t)?\b/],
  [
    "light therapy",
    /\blight ?(box|boxes|lamp|lamps|therapy)\b|\bsad lamp\b|\bbright light\b/,
  ],
  [
    "sunlight claim",
    /\b(sun ?light|daylight|morning light|natural light)\b.{0,40}\b(mood|depress\w*|treat\w*|cure|fix|lift|boost|heal\w*)\b|\b(mood|depress\w*|treat\w*|cure|fix|lift|boost|heal\w*)\b.{0,40}\b(sun ?light|daylight|morning light|natural light)\b/,
  ],
  [
    "sleep restriction",
    /\bsleep restriction\b|\bstay(ing)? up\b|\bsleep (less|deprivation)\b|\bcut(ting)? (down|back) on sleep\b|\b(strict|fixed|rigid) (bed ?time|sleep schedule)\b|\bgo to bed (at|by|before) \d/,
  ],
  [
    "bedtime rule",
    /\bbed ?time (reminders?|alarms?|routines?|schedules?|rules?|deadlines?|targets?)\b|\b(set|keep to|stick to|follow) (a |an |your )?(\w+ )?bed ?time\b/,
  ],
  [
    "expressive writing",
    /\bexpressive writing\b|\bjournal\w*\b.{0,40}\b(feelings?|emotions?)\b|\bwrit(e|ing)\b.{0,40}\b(your|how you) (feelings?|emotions?|feel)\b|\bjournal\w* for \d+|\bwrit(e|ing) for \d+ minutes\b/,
  ],
  [
    "relaxation add-on",
    /\b(progressive )?muscle relaxation\b|\brelaxation (exercise|technique|training)s?\b|\bmeditat\w*|\bmindfulness\b|\bmood (log|logging|tracking|tracker|diary)\b/,
  ],
  [
    "affirmation",
    /\baffirmations?\b|\bpositive (self-?talk|self-?statements?|thinking)\b|\bmantras?\b/,
  ],
  ["gratitude", /\bgratitude\b|\bthree good things\b|\bcount your blessings\b/],
  [
    "supplement or medication",
    /\b(supplements?|medications?|medicines?|meds|doses?|dosage|vitamins?|antidepressants?)\b/,
  ],
  ["alcohol", /\b(alcohol|beer|wine|vodka|whisk(e)?y|cocktails?)\b/],
  [
    "work decision",
    /\b(quit|leave|resign from|give up|hand in your notice)\b.{0,20}\b(job|work|course|studies|degree)\b|\btell (your )?(boss|employer|manager|school|teacher)\b|\bdisclos\w*/,
  ],
  [
    "diagnosis",
    /\bdiagnos\w*|\byou (may |might |probably |likely |seem to )?(have|are suffering from|suffer from) (depression|anxiety|adhd|bipolar|ptsd|an? \w+ disorder)\b|\bclinical depression\b/,
  ],
  [
    "clinical claim",
    /\b(clinically|clinical|proven|studies show|research shows|evidence shows|science says|guarantee\w*)\b|\b(will|should|can|is sure to) (definitely )?(make you feel|help you feel|cure|fix|lift your mood|boost your mood|improve your mood|reduce your (depression|symptoms))\b|\b(treatment|therapeutic|cures?)\b|\b(you'?ll|you will) (definitely |really |probably )?(feel|enjoy|love|like|be glad)\b/,
  ],
  ["streak", /\bstreaks?\b/],
  [
    "missed",
    /\byou('ve| have)? (missed|skipped|failed|fell behind)\b|\b(overdue|backlog|falling behind|catch up on)\b/,
  ],
  ["we/us", /\b(we|us|together|let'?s|lets)\b/],
];

/** Names of the guardrails a text breaks (empty when it is fine). */
export function guardrailHits(text: string): string[] {
  const t = normalise(text);
  return guardrails.filter(([, re]) => re.test(t)).map(([name]) => name);
}

/** True when text mentions anything on the never-suggest list. */
export function breaksGuardrails(text: string): boolean {
  return guardrailHits(text).length > 0;
}

// --- Food and exercise (used when an eating concern is flagged) --------------

const foodTerms =
  /\b(eat|eating|eats|ate|meal|meals|food|lunch|breakfast|dinner|supper|snack|snacks|cook|cooking|bake|baking|hungry|hunger|appetite|recipe|fruit|toast|sandwich|restaurant)\b/;
const exerciseTerms =
  /\b(walk|walks|walking|run|running|jog|jogging|gym|workout|exercise|exercising|stretch|stretching|cycle|cycling|bike|swim|swimming|yoga|fitness|sport|sports)\b/;

export const mentionsFood = (text: string) => foodTerms.test(normalise(text));
export const mentionsExercise = (text: string) =>
  exerciseTerms.test(normalise(text));

// --- Eating concern ----------------------------------------------------------

// Rule-based and deliberately narrow. It looks for patterns that point at
// restricting, bingeing, purging or weight and body worry, so that Koe drops
// food and exercise items and suggests telling a clinician. An ordinary
// remark about a busy day ("I skipped lunch") does not flag: wrongly treating
// everyone who forgot lunch as unwell would be a harm of its own. It is a
// plan-safety switch, never a diagnosis, and its result is never shown as one.
const eatingPatterns: RegExp[] = [
  /\brestrict(ing|ed|ion)?\b.{0,20}\b(food|eating|intake|calories|myself)\b/,
  /\bfood restriction\b|\bbeen restricting\b/,
  /\b(not|barely|hardly|stopped|stop|stopping|can'?t bring myself to|refuse to|won'?t) (been )?(eat|eating)\b(?! (out|in|meat|dairy|sugar|gluten|there|here|at))/,
  /\b(haven'?t|have not|hadn'?t) eaten (anything|properly|in days|for days|all day|much)\b/,
  /\bstarv(e|ed|ing) myself\b/,
  /\bdon'?t deserve (to eat|food|dinner|lunch|breakfast)\b/,
  /\bskip(ping|ped)? meals? (on purpose|deliberately|to lose|to avoid|so i don'?t)\b/,
  /\bbing(e|ed|eing|es)\b/,
  /\b(purge|purged|purging)\b(?! (my |the |our )?(closet|wardrobe|email|emails|inbox|files|house|room|stuff|clutter|apps|phone|garage|cupboards?))/,
  /\b(throw(ing)? up|vomit(ing)?|make myself (sick|throw up|vomit)|making myself (sick|throw up|vomit))\b.{0,30}\b(after|eating|meal|food|dinner|lunch)\b/,
  /\b(after|eating|meal|food|dinner|lunch)\b.{0,30}\b(throw(ing)? up|vomit(ing)?)\b/,
  /\blaxatives?\b/,
  /\bhate my (body|weight|thighs|stomach|belly|arms)\b/,
  /\b(disgusted|disgusting) (by|with|about) my (body|weight|stomach|belly)\b/,
  /\b(feel|feeling|am|i'?m|so|too|really) (so |really |too )?fat\b/,
  /\bworr(y|ied|ying) about (my )?(weight|body|eating|food)\b/,
  /\b(lose|losing|drop|dropping|lost|gain|gained|gaining) (some |more |a lot of |so much |too much )?weight\b/,
  /\bcalor(ie|ies)\b/,
  /\b(on a|going on a|my) (crash )?diet\b|\bdieting\b/,
  /\beating disorder\b|\banorexi\w*|\bbulimi\w*/,
];

// Phrases that contain a trigger word but are about something else.
const eatingExceptions =
  /\bbing(e|ed|ing)[- ]?(watch|read|play|stream|listen|gam)\w*|\bbing(e|ed|ing) (on )?(shows?|series|netflix|tv|youtube|games?|podcasts?)\b/g;

export function detectEatingConcern(text: string): boolean {
  const t = normalise(text).replace(eatingExceptions, " ");
  return eatingPatterns.some((re) => re.test(t));
}

// --- Times -------------------------------------------------------------------

/** Last minute an item may start: 21:30. */
export const LAST_MINUTE = 21 * 60 + 30;

/** The earliest an item may start, from the wake-time answer. */
export function wakeStart(wake?: Wake): number {
  switch (wake) {
    case "before7":
      return 6 * 60 + 30;
    case "7to9":
      return 8 * 60;
    case "9to11":
    case "later_varies":
      return 10 * 60;
    default:
      return 8 * 60;
  }
}

function anchor(band: Band, start: number) {
  if (band === "morning") return start;
  if (band === "midday") return Math.max(12 * 60 + 30, start + 180);
  return Math.max(18 * 60 + 30, start + 360);
}

/**
 * One start time per kind, in the order given: each kind goes in its usual
 * part of the day, never before the person is up, never closer than 45
 * minutes to the item before it, never after 21:30.
 */
export function assignTimes(kinds: PlanKind[], wake?: Wake): number[] {
  const start = wakeStart(wake);
  const order = kinds
    .map((kind, i) => ({ i, at: anchor(planMenu[kind].band, start) }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const out: number[] = new Array(kinds.length);
  let previous = -Infinity;
  for (const { i, at } of order) {
    const t = Math.min(Math.max(at, previous + 45), LAST_MINUTE);
    out[i] = t;
    previous = t;
  }
  return out;
}

// --- Composition -------------------------------------------------------------

export type CompositionContext = {
  /** First day: exactly three items, tiny or small. */
  firstDay: boolean;
  /** The person said something used to lift them. */
  hasLifts: boolean;
  /** The person named someone to reach out to. */
  namedPerson: boolean;
  /** Food or weight worry was flagged: no food items, no movement. */
  eatingConcern: boolean;
  wake?: Wake;
  /**
   * The day was made lighter on purpose (a low check-in, "too much", or a
   * quiet few days): 1 to 3 items, and an anchor (an enjoy item or one of
   * the basics) stands in for the usual "something that lifts" rule.
   */
  lighter?: boolean;
};

export function contextFor(
  model: IntakeModel,
  firstDay = true,
): CompositionContext {
  return {
    firstDay,
    hasLifts: hasLifts(model),
    namedPerson: model.names.length > 0,
    eatingConcern: model.eatingConcern,
    wake: model.wake,
  };
}

export type ViolationCode =
  | "count"
  | "reach_out_limit"
  | "move_limit"
  | "no_lift"
  | "no_core"
  | "reach_out_unnamed"
  | "eating"
  | "size"
  | "time";

export type Violation = {
  code: ViolationCode;
  message: string;
  /** The offending item, when one item is at fault. */
  index?: number;
};

export const coreKinds: PlanKind[] = [
  "task",
  "basics",
  "work_chunk",
  "problem",
  "wind_down",
];

/** What is wrong with a day's plan; an empty list means it is allowed. */
export function checkComposition(
  items: Pick<PlanItem, "kind" | "title" | "size" | "minuteOfDay">[],
  ctx: CompositionContext,
): Violation[] {
  const out: Violation[] = [];
  const add = (code: ViolationCode, message: string, index?: number) =>
    out.push({ code, message, index });

  if (ctx.lighter) {
    if (items.length < 1 || items.length > 3)
      add("count", "A lighter day has 1 to 3 items.");
  } else if (
    ctx.firstDay ? items.length !== 3 : items.length < 3 || items.length > 5
  )
    add(
      "count",
      ctx.firstDay
        ? "The first day has exactly 3 items."
        : "A day has 3 to 5 items.",
    );

  let reach = 0;
  let move = 0;
  const start = wakeStart(ctx.wake);
  items.forEach((item, i) => {
    if (item.kind === "reach_out") {
      if (++reach > 1) add("reach_out_limit", "At most one reach out.", i);
      if (!ctx.namedPerson)
        add("reach_out_unnamed", "Reach out only to someone named.", i);
    }
    if (item.kind === "move" && ++move > 1)
      add("move_limit", "At most one move item.", i);
    if (ctx.eatingConcern) {
      if (item.kind === "move")
        add("eating", "No movement items when food worry is flagged.", i);
      else if (mentionsFood(item.title) || mentionsExercise(item.title))
        add(
          "eating",
          "No food or exercise items when food worry is flagged.",
          i,
        );
    }
    if (ctx.firstDay && item.size === "medium")
      add("size", "The first day is tiny or small.", i);
    if (item.minuteOfDay < start || item.minuteOfDay > LAST_MINUTE)
      add(
        "time",
        `Times run from ${formatMinutes(start)} to ${formatMinutes(LAST_MINUTE)}.`,
        i,
      );
  });
  if (ctx.lighter) {
    if (!items.some((x) => x.kind === "enjoy" || coreKinds.includes(x.kind)))
      add(
        "no_core",
        "A lighter day keeps one anchor: the basics or something enjoyed.",
      );
    return out;
  }
  if (ctx.hasLifts && !items.some((x) => x.kind === "enjoy"))
    add("no_lift", "One item should come from what used to lift them.");
  if (!items.some((x) => coreKinds.includes(x.kind)))
    add(
      "no_core",
      "One item should be a task, the basics, a work chunk, a problem or winding down.",
    );
  return out;
}

// --- Fallback plan -----------------------------------------------------------

type Candidate = Omit<PlanItem, "minuteOfDay">;

/** A small stable number from the answers, so the same answers give the same plan. */
export function seedOf(model: IntakeModel) {
  const s = JSON.stringify(model);
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const liftExamples: Record<
  Lift,
  { tiny: string; small: string; food?: true; exercise?: true }
> = {
  music: {
    tiny: "Put on one song you used to like",
    small: "Listen to a few songs you used to like",
  },
  walking: {
    tiny: "Step outside and walk to the corner and back",
    small: "Take a ten-minute walk somewhere you like",
    exercise: true,
  },
  cooking: {
    tiny: "Make a hot drink the way you like it",
    small: "Make a simple snack you like",
    food: true,
  },
  games: {
    tiny: "Play one round of a game you used to like",
    small: "Play a game you used to like for ten minutes",
  },
  pets: {
    tiny: "Give a pet a few minutes of your attention",
    small: "Spend ten minutes with a pet, yours or a friend's",
  },
  outdoors: {
    tiny: "Spend five minutes outdoors somewhere you like",
    small: "Spend ten minutes outdoors somewhere you like",
  },
  making: {
    tiny: "Pick up what you make things with for two minutes",
    small: "Work on something you make for ten minutes",
  },
  faith: {
    tiny: "Take a quiet minute in a way that matters to you",
    small: "Spend ten minutes on something from your faith that you value",
  },
  reading: {
    tiny: "Read one page of something you like",
    small: "Read for ten minutes",
  },
  shows: {
    tiny: "Watch one short clip of a show you like",
    small: "Watch an episode of a show you used to like",
  },
  other: {
    tiny: "Spend two minutes on something you used to enjoy",
    small: "Spend ten minutes on something you used to enjoy",
  },
};

export function whyFor(kind: PlanKind, model: IntakeModel): string {
  const goal = model.goals[0];
  const said = (g: keyof typeof goalPhrases) =>
    `Because you said ${goalPhrases[g]} would help most`;
  switch (kind) {
    case "task":
      return model.puttingOff
        ? "Because you said there is something you keep putting off"
        : "Because a small start is easier than the whole job";
    case "basics":
      return model.goals.includes("basics")
        ? said("basics")
        : goal
          ? said(goal)
          : "Because a small basic is an easy place to start";
    case "work_chunk":
      return model.goals.includes("work_study")
        ? said("work_study")
        : model.days === "working" || model.days === "studying"
          ? "Because you said your days are mostly work or study"
          : "Because a small start is easier than the whole job";
    case "wind_down":
      return model.goals.includes("sleep")
        ? said("sleep")
        : "Because a quiet end to the day is an easy place to stop";
    case "move":
      return model.goals.includes("energy")
        ? said("energy")
        : "Because a little movement is a small way to begin";
    case "outside":
      return goal
        ? said(goal)
        : "Because a minute of outside air is a small, easy start";
    case "kind":
      return "Because a kind word to yourself costs nothing";
    case "problem":
      return "Because one clear thing to do next can make a problem smaller";
    case "care":
      return "Because it helps to have someone who can help in your corner";
    case "reach_out":
      return "Because you named someone who is in your corner";
    case "enjoy":
      return "Because a small try is enough to see how it feels";
  }
}

const fill = (title: string, name: string) => title.replace("{name}", name);

/** Names the person gave that are safe to put in a title. */
export function usableNames(model: IntakeModel) {
  return namedPeople(model).filter((n) => !breaksGuardrails(n));
}

/**
 * Every plan item Koe could offer for a kind on a first day, best first:
 * the kind's preferred size first, then the other tiny/small variants.
 */
export function candidatesFor(kind: PlanKind, model: IntakeModel): Candidate[] {
  const eating = model.eatingConcern;
  const seed = seedOf(model);
  const ok = (e: Example) => !eating || (!e.food && !e.exercise);
  const sizes: PlanSize[] = ["tiny", "small"];
  const preferred = planMenu[kind].preferred;
  const order = [preferred, ...sizes.filter((s) => s !== preferred)];
  const out: Candidate[] = [];

  if (kind === "enjoy") {
    const chosen = model.lifts.filter(
      (l) => !eating || (!liftExamples[l].food && !liftExamples[l].exercise),
    );
    // Rotate so the same answers always give the same first choice.
    const lifts = chosen.length
      ? [
          ...chosen.slice(seed % chosen.length),
          ...chosen.slice(0, seed % chosen.length),
        ]
      : [];
    for (const size of order)
      for (const lift of lifts)
        out.push({
          kind,
          title: liftExamples[lift][size as "tiny" | "small"],
          why:
            lift === "other"
              ? "Because you said something used to lift you a little"
              : `Because you said ${liftPhrases[lift]} used to lift you`,
          size,
        });
    if (!out.length) {
      // Something used to lift them but nothing here is safe to name, or
      // nothing was said at all: keep it open and low pressure.
      const said = hasLifts(model);
      for (const size of order)
        out.push({
          kind,
          title: liftExamples.other[size as "tiny" | "small"],
          why: said
            ? "Because you said some things used to lift you a little"
            : "Because a small try is enough to see how it feels",
          size,
        });
    }
    return out;
  }

  if (kind === "reach_out") {
    const names = usableNames(model);
    for (const size of order)
      for (const name of names)
        for (const e of planMenu.reach_out.examples[size])
          out.push({
            kind,
            title: fill(e.title, name),
            why: `Because you named ${name} as someone in your corner`,
            size,
          });
    return out;
  }

  if (kind === "task" && model.puttingOff) {
    return [
      {
        kind,
        title: "Do the first tiny part of the thing you keep putting off",
        why: whyFor(kind, model),
        size: "tiny",
      },
      {
        kind,
        title: "Spend ten minutes on the thing you keep putting off",
        why: whyFor(kind, model),
        size: "small",
      },
    ];
  }

  for (const size of order)
    for (const e of planMenu[kind].examples[size])
      if (ok(e))
        out.push({ kind, title: e.title, why: whyFor(kind, model), size });
  return out;
}

/** Lifts that are safe to name: food and exercise ones drop out on an eating concern. */
export function usableLifts(model: IntakeModel): Lift[] {
  return model.lifts.filter(
    (l) =>
      !model.eatingConcern ||
      (!liftExamples[l].food && !liftExamples[l].exercise),
  );
}

export function pickFirst(
  kind: PlanKind,
  model: IntakeModel,
): Candidate | null {
  const list = candidatesFor(kind, model);
  if (!list.length) return null;
  // "Send {name} a short hello" is the one reach out wording worth fixing.
  if (kind === "reach_out") return list[0];
  const preferred = list.filter((c) => c.size === list[0].size);
  return preferred[seedOf(model) % preferred.length];
}

/** Kinds for a first day, in the order they are decided. */
export function chooseKinds(model: IntakeModel): PlanKind[] {
  const eating = model.eatingConcern;
  const goals = new Set(model.goals);
  const named = usableNames(model).length > 0;
  const workish =
    goals.has("work_study") ||
    model.days === "working" ||
    model.days === "studying";

  const kinds: PlanKind[] = [];
  const allowed = (k: PlanKind) =>
    !(k === "move" && eating) && !(k === "reach_out" && !named);
  const push = (k: PlanKind) => {
    if (kinds.length < 3 && !kinds.includes(k) && allowed(k)) kinds.push(k);
  };

  if (hasLifts(model)) push("enjoy");
  // One mastery or basics item is always there.
  const core: PlanKind = model.puttingOff
    ? "task"
    : goals.has("basics") || eating
      ? "basics"
      : goals.has("sleep")
        ? "wind_down"
        : workish
          ? "work_chunk"
          : "basics";
  push(core);

  if (!hasLifts(model) && goals.has("enjoy_again")) push("enjoy");
  // The rest follow what they asked for.
  if (goals.has("less_alone")) {
    push("reach_out");
    push("outside");
  }
  if (goals.has("energy")) {
    push("move");
    push("outside");
  }
  if (goals.has("through_day")) {
    push("outside");
    push("reach_out");
  }
  if (goals.has("sleep")) push("wind_down");
  if (goals.has("work_study")) push("work_chunk");
  // Then the gentle defaults. Care stands in when food worry rules out movement.
  for (const k of [
    "outside",
    "reach_out",
    "kind",
    "move",
    "wind_down",
  ] as const)
    push(k);
  if (eating) push("care");
  return kinds;
}

/**
 * A rules-based first-day plan that always satisfies checkComposition. Used
 * whenever the model is off, slow or wrong, and as the pool of replacements.
 */
export function fallbackPlan(model: IntakeModel): PlanItem[] {
  const kinds = chooseKinds(model);
  const picked: Candidate[] = [];
  for (const kind of kinds) {
    const c = pickFirst(kind, model);
    if (c) picked.push(c);
  }
  // Safety net: the lists above always give three, but never return fewer.
  for (const kind of ["outside", "kind", "wind_down", "basics"] as const) {
    if (picked.length >= 3) break;
    const c = picked.some((p) => p.kind === kind)
      ? null
      : pickFirst(kind, model);
    if (c) picked.push(c);
  }
  const minutes = assignTimes(
    picked.map((p) => p.kind),
    model.wake,
  );
  return picked
    .map((c, i): PlanItem => ({ ...c, minuteOfDay: minutes[i] }))
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}

/**
 * The next different item of the same kind, for "swap". Keeps the time slot.
 * Cycles through the fallback variants, so repeated swaps keep giving options.
 */
export function alternativeFor(
  item: PlanItem,
  model: IntakeModel,
): PlanItem | null {
  const list = candidatesFor(item.kind, model);
  if (list.length < 2) return null;
  const at = list.findIndex((c) => c.title === item.title);
  const next = list[(at + 1) % list.length];
  if (next.title === item.title) return null;
  return { ...next, minuteOfDay: item.minuteOfDay };
}

// --- Menu examples (for prompts and for measuring copied wording) -----------

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let exampleMatchers: RegExp[] | undefined;

/**
 * True when a title is one of the menu's or the fallback's own example
 * sentences word for word (a person's name may fill the {name} slot). Used
 * by the live eval to see whether the model wrote its own wording.
 */
export function isMenuExample(title: string): boolean {
  exampleMatchers ??= [
    ...planKinds.flatMap((k) =>
      Object.values(planMenu[k].examples).flatMap((list) =>
        list.map((e) => e.title),
      ),
    ),
    ...Object.values(liftExamples).flatMap((e) => [e.tiny, e.small]),
  ].map(
    (t) =>
      new RegExp(
        "^" + escapeRe(normalise(t)).replace("\\{name\\}", ".{1,40}") + "$",
      ),
  );
  const t = normalise(title);
  return exampleMatchers.some((re) => re.test(t));
}

// --- Prompt text, generated from the menu -----------------------------------

const sizeGuide =
  "tiny is 1 to 2 minutes and a single action; small is about 10 minutes; medium is 20 to 30 minutes";

/**
 * The menu as prompt text: label, when to pick it, and the kinds of action it
 * covers. It deliberately holds no example sentences: models copy them word
 * for word (see titleRulesPromptText).
 */
export function menuPromptText(): string {
  return [
    `Sizes: ${sizeGuide}.`,
    ...planKinds.map(
      (k) =>
        `- ${k} (shown as "${planMenu[k].label}"; usually ${planMenu[k].band}): ${planMenu[k].pick} Kinds of action: ${planMenu[k].ideas}.`,
    ),
  ].join("\n");
}

/**
 * How a title is written. Shared by the intake and planner prompts so the
 * rule cannot drift: titles come from the person's own words, and the menu's
 * illustrations are never repeated.
 */
export function titleRulesPromptText(): string {
  return [
    "The menu lists kinds of action, not sentences. Write every title yourself in fresh words; never reach for a stock phrase.",
    "Build every title from the person's own words: their interests, the job they keep putting off, the person they named, the place or time they mentioned. Name the actual thing (which song or record, which letter or task, which person, which room or walk).",
    "If they gave you nothing for a kind, still choose your own concrete wording and object; do not fall back on a menu sentence.",
    "Each title starts with a verb, is at most 80 characters, and is one action the person can start now.",
  ].join("\n");
}

/** The composition rules for this person, as prompt text. */
export function compositionPromptText(ctx: CompositionContext): string {
  const start = formatMinutes(wakeStart(ctx.wake));
  const rules = [
    ctx.lighter
      ? "This is a lighter day: 1 to 3 items in all, every new or changed item tiny. Keep one anchor (an enjoy item or the basics)."
      : ctx.firstDay
        ? "Exactly 3 items (this is the first day), each tiny or small."
        : "3 to 5 items.",
    "At most one reach_out and at most one move.",
    ctx.lighter
      ? null
      : ctx.hasLifts
        ? "Include one enjoy item built from what the person said used to lift them."
        : "The person named nothing that used to lift them: do not promise fun; lead with basics or mastery.",
    ctx.lighter
      ? null
      : "Include at least one of task, basics, work_chunk, problem or wind_down.",
    ctx.namedPerson
      ? "reach_out is allowed, only for someone the person named."
      : "Do not use reach_out: the person named no one.",
    ctx.eatingConcern
      ? "Food or weight worry is flagged: no food, eating, cooking, movement, walking or exercise items of any kind."
      : null,
    `minuteOfDay is minutes after midnight, between ${wakeStart(ctx.wake)} (${start}) and ${LAST_MINUTE} (${formatMinutes(LAST_MINUTE)}); morning items first, enjoy and wind_down later in the day; items at least 45 minutes apart.`,
  ];
  return rules.filter((r): r is string => !!r).join("\n");
}
