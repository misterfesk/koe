import { z } from "zod";
import type { PlanItem } from "./plan-menu";

// The five day-zero questions. Pure data and rules: no database, no model.
// Every question can be skipped, so every field is optional or empty.

export const goals = [
  "through_day",
  "sleep",
  "energy",
  "less_alone",
  "enjoy_again",
  "work_study",
  "basics",
] as const;
export type Goal = (typeof goals)[number];

export const goalLabels: Record<Goal, string> = {
  through_day: "Getting through the day",
  sleep: "Sleep",
  energy: "Energy and motivation",
  less_alone: "Feeling less alone",
  enjoy_again: "Getting back to things I enjoyed",
  work_study: "Work or study",
  basics: "Looking after the basics",
};

/** Reads after "you said ...": used in plan reasons and the template summary. */
export const goalPhrases: Record<Goal, string> = {
  through_day: "getting through the day",
  sleep: "sleep",
  energy: "energy and motivation",
  less_alone: "feeling less alone",
  enjoy_again: "getting back to things you enjoyed",
  work_study: "work or study",
  basics: "looking after the basics",
};

export const wakes = ["before7", "7to9", "9to11", "later_varies"] as const;
export type Wake = (typeof wakes)[number];
export const wakeLabels: Record<Wake, string> = {
  before7: "Before 7",
  "7to9": "Between 7 and 9",
  "9to11": "Between 9 and 11",
  later_varies: "Later, or it varies",
};

export const dayKinds = [
  "working",
  "studying",
  "home",
  "caring",
  "mix",
] as const;
export type DayKind = (typeof dayKinds)[number];
export const dayLabels: Record<DayKind, string> = {
  working: "Working",
  studying: "Studying",
  home: "At home",
  caring: "Looking after someone",
  mix: "A mix",
};

export const busiestTimes = [
  "morning",
  "afternoon",
  "evening",
  "varies",
] as const;
export type Busiest = (typeof busiestTimes)[number];
export const busiestLabels: Record<Busiest, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  varies: "It varies",
};

export const lifts = [
  "music",
  "walking",
  "cooking",
  "games",
  "pets",
  "outdoors",
  "making",
  "faith",
  "reading",
  "shows",
  "other",
] as const;
export type Lift = (typeof lifts)[number];
export const liftLabels: Record<Lift, string> = {
  music: "Music",
  walking: "Walking",
  cooking: "Cooking",
  games: "Games",
  pets: "Pets",
  outdoors: "Being outdoors",
  making: "Making things",
  faith: "Faith",
  reading: "Reading",
  shows: "Shows",
  other: "Something else",
};
/** Reads after "you said ...  used to lift you". */
export const liftPhrases: Record<Lift, string> = {
  music: "music",
  walking: "walking",
  cooking: "cooking",
  games: "games",
  pets: "time with pets",
  outdoors: "being outdoors",
  making: "making things",
  faith: "your faith",
  reading: "reading",
  shows: "watching shows",
  other: "something you used to enjoy",
};

export const peopleKinds = [
  "friend",
  "family",
  "partner",
  "therapist_doctor",
  "nobody",
] as const;
export type PeopleKind = (typeof peopleKinds)[number];
export const peopleLabels: Record<PeopleKind, string> = {
  friend: "A friend",
  family: "Family",
  partner: "A partner",
  therapist_doctor: "A therapist or doctor",
  nobody: "Nobody right now",
};

export const supports = [
  "therapist",
  "doctor",
  "not_now",
  "rather_not_say",
] as const;
export type Support = (typeof supports)[number];
export const supportLabels: Record<Support, string> = {
  therapist: "A therapist",
  doctor: "A doctor",
  not_now: "Not right now",
  rather_not_say: "I'd rather not say",
};

export const introTones = ["calm", "expressive", "plain"] as const;
export type IntroTone = (typeof introTones)[number];
export const toneChoices: { value: IntroTone; label: string; hint: string }[] =
  [
    { value: "calm", label: "Gentle", hint: "Quiet and unhurried" },
    { value: "expressive", label: "Upbeat", hint: "Warm and encouraging" },
    { value: "plain", label: "Straight-talking", hint: "Short and plain" },
  ];

export const morningPlans = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "none",
] as const;
export type MorningPlan = (typeof morningPlans)[number];

export const FREE_TEXT_MAX = 200;

// Free text is optional everywhere: an empty box is the same as no answer.
const freeText = z
  .string()
  .trim()
  .max(FREE_TEXT_MAX)
  .transform((v) => v || undefined)
  .optional();
const unique = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .default([])
    .transform((list) => [...new Set(list)]);

export const intakeModel = z.object({
  goals: unique(z.enum(goals), 2),
  wake: z.enum(wakes).optional(),
  days: z.enum(dayKinds).optional(),
  busiest: z.enum(busiestTimes).optional(),
  puttingOff: freeText,
  lifts: unique(z.enum(lifts), lifts.length),
  people: unique(z.enum(peopleKinds), peopleKinds.length),
  names: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        // The person ticked "save to my people".
        save: z.boolean().default(false),
      }),
    )
    .max(3)
    .default([]),
  support: z.enum(supports).optional(),
  tone: z.enum(introTones).optional(),
  // Stored for the reminders slice; nothing is scheduled from it here.
  morningPlan: z.enum(morningPlans).optional(),
  notes: z
    .object({
      goals: freeText,
      day: freeText,
      lifts: freeText,
      people: freeText,
    })
    .default({}),
  // Set by code from what the person wrote; the words themselves are dropped.
  eatingConcern: z.boolean().default(false),
});
export type IntakeModel = z.output<typeof intakeModel>;
export type IntakeInput = z.input<typeof intakeModel>;

export const emptyModel = (): IntakeModel => intakeModel.parse({});

/** Every free-text value in the model, for safety checks. */
export function freeTexts(model: IntakeModel): string[] {
  return [
    model.puttingOff,
    model.notes.goals,
    model.notes.day,
    model.notes.lifts,
    model.notes.people,
    ...model.names.map((n) => n.name),
  ].filter((t): t is string => !!t);
}

/** True when anything is said under "what used to lift you". */
export function hasLifts(model: IntakeModel) {
  return model.lifts.length > 0 || !!model.notes.lifts;
}

export function namedPeople(model: IntakeModel) {
  return model.names.map((n) => n.name);
}

export function isEmptyModel(model: IntakeModel) {
  return (
    !model.goals.length &&
    !model.wake &&
    !model.days &&
    !model.busiest &&
    !model.puttingOff &&
    !model.lifts.length &&
    !model.people.length &&
    !model.names.length &&
    !model.support &&
    !model.tone &&
    !model.morningPlan &&
    !Object.values(model.notes).some(Boolean)
  );
}

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];

/**
 * The summary used when no model is available (and the base for edits).
 * Second person, plain, built only from what was ticked.
 */
export function templateSummary(model: IntakeModel): string {
  const parts: string[] = [];
  if (model.goals.length)
    parts.push(
      `You'd like help with ${list(model.goals.map((g) => goalPhrases[g]))}.`,
    );
  const day: string[] = [];
  if (model.days)
    day.push(
      {
        working: "Your days are mostly work",
        studying: "Your days are mostly study",
        home: "You're mostly at home",
        caring: "You spend your days looking after someone",
        mix: "Your days are a mix",
      }[model.days],
    );
  if (model.busiest && model.busiest !== "varies")
    day.push(`${model.busiest}s are your busiest time`);
  if (model.wake)
    day.push(
      model.wake === "later_varies"
        ? "you wake later or at different times"
        : `you usually wake ${wakeLabels[model.wake].toLowerCase()}`,
    );
  if (day.length) {
    const text = day.join(", and ");
    parts.push(text.charAt(0).toUpperCase() + text.slice(1) + ".");
  }
  const liked = model.lifts.filter((l) => l !== "other");
  if (liked.length)
    parts.push(
      `${capitalise(list(liked.map((l) => liftLabels[l].toLowerCase())))} used to lift you a little.`,
    );
  else if (model.lifts.includes("other") || model.notes.lifts)
    parts.push("Some things used to lift you a little.");
  if (model.names.length)
    parts.push(
      `${list(namedPeople(model))} ${model.names.length > 1 ? "are" : "is"} in your corner.`,
    );
  else if (model.people.includes("nobody"))
    parts.push("Right now you don't have anyone in particular to lean on.");
  if (!parts.length)
    parts.push(
      "You skipped the questions, so Koe is starting with a simple, gentle day.",
    );
  return parts.join(" ").slice(0, 400);
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type MemoryProposal = {
  kind: "helps" | "hard" | "people" | "preference";
  text: string;
};

/** Memory proposals made without a model: only things the person ticked. */
export function templateMemories(model: IntakeModel): MemoryProposal[] {
  const out: MemoryProposal[] = [];
  const liked = model.lifts.filter((l) => l !== "other");
  if (liked.length)
    out.push({
      kind: "helps",
      text: `${capitalise(list(liked.map((l) => liftLabels[l].toLowerCase())))} used to lift you a little.`,
    });
  if (model.names.length)
    out.push({
      kind: "people",
      text: `${list(namedPeople(model))} ${model.names.length > 1 ? "are" : "is"} in your corner.`,
    });
  if (model.puttingOff)
    out.push({ kind: "hard", text: "There's one thing you keep putting off." });
  if (model.tone)
    out.push({
      kind: "preference",
      text: {
        calm: "You prefer a gentle, quiet tone.",
        expressive: "You prefer an upbeat, warm tone.",
        plain: "You prefer short, straight-talking wording.",
      }[model.tone],
    });
  return out.slice(0, 4);
}

/** What the reveal screen holds between "Getting to know you" and "Start my day". */
export type Reveal = {
  summary: string;
  memories: MemoryProposal[];
  items: PlanItem[];
  /** The model as it will be saved (flags set, flagged text dropped). */
  model: IntakeModel;
  eatingConcern: boolean;
  source: "ai" | "fallback";
};

/** The sealed JSON stored in user_model.data. */
export const storedModel = intakeModel.extend({ v: z.literal(1).default(1) });
