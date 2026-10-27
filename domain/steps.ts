import { z } from "zod";
import type { PlanKind, PlanOrigin, PlanSize } from "./plan-menu";
import { weekday } from "./time";

export type Area = "move" | "connect" | "care" | "do" | "enjoy";
export type Energy = "low" | "okay" | "more";
export type Outcome = "done" | "partly" | "not" | "skip";
export type Helped = "helped" | "same" | "harder";
export type Expectation = "low" | "unsure" | "good";
export type StepStatus = "active" | "paused" | "finished" | "archived";

export const areaLabels: Record<Area, string> = {
  move: "Move",
  connect: "People",
  care: "Look after yourself",
  do: "Get something done",
  enjoy: "Something you enjoy",
};

export const outcomeLabels: Record<Outcome, string> = {
  done: "Done",
  partly: "Partly",
  not: "Not this time",
  skip: "Prefer not to say",
};

export const helpedLabels: Record<Helped, string> = {
  helped: "It helped",
  same: "About the same",
  harder: "It made things harder",
};

export const expectationLabels: Record<Expectation, string> = {
  low: "Probably won't help",
  unsure: "Not sure",
  good: "Might help",
};

export type ReportView = {
  id: string;
  version: number;
  day: string;
  outcome: Outcome;
  helped: Helped | null;
  expectation: Expectation | null;
  barrier: string | null;
  note: string | null;
};

export type VersionView = {
  version: number;
  title: string;
  cue: string | null;
};

export type StepView = {
  id: string;
  area: Area;
  title: string;
  cue: string | null;
  expectation: Expectation | null;
  problem: string | null;
  status: StepStatus;
  repeatDays: number[] | null;
  plannedFor: string | null;
  version: number;
  sourceMemoryId: string | null;
  /** Day-plan fields: null on steps made before the plan menu existed. */
  kind: PlanKind | null;
  minuteOfDay: number | null;
  why: string | null;
  size: PlanSize | null;
  origin: PlanOrigin | null;
  createdAt: string;
  /** Newest first. */
  reports: ReportView[];
  versions: VersionView[];
};

const text = (max: number, message: string) =>
  z.string().trim().max(max, `Use ${max} characters or fewer.`).min(1, message);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const stepInput = z
  .object({
    area: z.enum(["move", "connect", "care", "do", "enjoy"]),
    title: text(160, "Give your step a few words."),
    cue: optionalText(120),
    expectation: z.enum(["low", "unsure", "good"]).nullable().optional(),
    problem: optionalText(1000),
    when: z.enum(["today", "tomorrow", "repeat"]),
    repeatDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    sourceMemoryId: z.string().max(64).nullable().optional(),
    sourceConversationId: z.string().max(64).nullable().optional(),
  })
  .refine((v) => v.when !== "repeat" || (v.repeatDays?.length ?? 0) > 0, {
    path: ["repeatDays"],
    message: "Pick at least one day, or choose today or tomorrow.",
  });
export type StepInput = z.input<typeof stepInput>;

export const reportInput = z.object({
  stepId: z.string().max(64),
  outcome: z.enum(["done", "partly", "not", "skip"]),
});

export const reportDetailInput = z.object({
  reportId: z.string().max(64),
  helped: z.enum(["helped", "same", "harder"]).nullable().optional(),
  barrier: optionalText(1000),
  note: optionalText(1000),
});

export function isRepeating(step: Pick<StepView, "repeatDays">) {
  return !!step.repeatDays && step.repeatDays.length > 0;
}

/** The report for `day`, if the step was reported that day. */
export function reportOn(step: StepView, day: string) {
  return step.reports.find((r) => r.day === day);
}

/** Would this step ask for attention today, ignoring whether it was reported? */
export function isDue(step: StepView, today: string) {
  if (step.status !== "active") return false;
  if (isRepeating(step)) return step.repeatDays!.includes(weekday(today));
  return !step.plannedFor || step.plannedFor <= today;
}

/**
 * What Today shows: steps still waiting for today, and steps already reported
 * today (with that report). A one-off that was done today is finished but
 * still shown so the person sees it counted.
 */
export function todayPlan(steps: StepView[], today: string) {
  const waiting: StepView[] = [];
  const reported: { step: StepView; report: ReportView }[] = [];
  for (const step of steps) {
    const report = reportOn(step, today);
    if (report && (step.status === "active" || step.status === "finished")) {
      reported.push({ step, report });
    } else if (isDue(step, today)) {
      waiting.push(step);
    }
  }
  // Planned items go in time order; older steps keep their order, after them.
  const byTime = (a: StepView, b: StepView) =>
    (a.minuteOfDay ?? Infinity) - (b.minuteOfDay ?? Infinity) || 0;
  waiting.sort(byTime);
  reported.sort((a, b) => byTime(a.step, b.step));
  return { waiting, reported };
}

export function upcoming(steps: StepView[], today: string) {
  return steps.filter(
    (s) =>
      s.status === "active" &&
      !isDue(s, today) &&
      !reportOn(s, today) &&
      (isRepeating(s) || (s.plannedFor ?? "") > today),
  );
}
