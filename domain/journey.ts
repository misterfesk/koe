import { areaLabels, type StepView } from "./steps";

// Patterns are plain counts from the person's own ratings. No correlations,
// no causal claims, no scores: automated pattern feedback has mixed evidence,
// so Koe only shows what was counted and lets the person decide if it fits.

export const MIN_RATINGS = 5;

export type Pattern = {
  key: string;
  text: string;
  /** Wording for a memory card if the person says it fits. */
  memory: string;
};

type Rated = {
  stepId: string;
  title: string;
  area: StepView["area"];
  helped: "helped" | "same" | "harder";
  expectation: "low" | "unsure" | "good" | null;
};

function rated(steps: StepView[], since?: string): Rated[] {
  return steps.flatMap((s) =>
    s.reports
      .filter((r) => r.helped && (!since || r.day >= since))
      .map((r) => ({
        stepId: s.id,
        title: s.title,
        area: s.area,
        helped: r.helped!,
        expectation: r.expectation,
      })),
  );
}

export function ratingCount(steps: StepView[]) {
  return rated(steps).length;
}

export function patterns(steps: StepView[], dismissed: string[]): Pattern[] {
  const all = rated(steps);
  if (all.length < MIN_RATINGS) return [];
  const out: Pattern[] = [];

  const byArea = new Map<StepView["area"], Rated[]>();
  for (const r of all) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  for (const [area, list] of byArea) {
    if (list.length < 3) continue;
    const helped = list.filter((r) => r.helped === "helped").length;
    if (helped / list.length < 0.6) continue;
    out.push({
      key: "area:" + area,
      text: `${areaLabels[area]}: you said ${helped} of ${list.length} rated steps helped.`,
      memory: `${areaLabels[area]} steps often help you.`,
    });
  }

  const surprises = all.filter(
    (r) =>
      (r.expectation === "low" || r.expectation === "unsure") &&
      r.helped === "helped",
  ).length;
  if (surprises >= 2)
    out.push({
      key: "surprise",
      text: `${surprises} times you didn't expect a step to help, and afterwards you said it did.`,
      memory: "Things often go better than you expect beforehand.",
    });

  const byStep = new Map<string, Rated[]>();
  for (const r of all)
    byStep.set(r.stepId, [...(byStep.get(r.stepId) ?? []), r]);
  for (const [stepId, list] of byStep) {
    const helped = list.filter((r) => r.helped === "helped").length;
    if (helped < 3) continue;
    out.push({
      key: "step:" + stepId,
      text: `"${list[0].title}" helped ${helped} times.`,
      memory: `"${list[0].title}" tends to help you.`,
    });
  }

  return out.filter((p) => !dismissed.includes(p.key)).slice(0, 4);
}

export type WeekSummary = {
  answered: number;
  done: number;
  partly: number;
  not: number;
  helped: { title: string; day: string }[];
  surprises: { title: string; day: string }[];
};

/** Counts for the weekly look-back over [from, to] inclusive. */
export function weekSummary(
  steps: StepView[],
  from: string,
  to: string,
): WeekSummary {
  const s: WeekSummary = {
    answered: 0,
    done: 0,
    partly: 0,
    not: 0,
    helped: [],
    surprises: [],
  };
  for (const step of steps)
    for (const r of step.reports) {
      if (r.day < from || r.day > to || r.outcome === "skip") continue;
      s.answered++;
      s[r.outcome]++;
      if (r.helped === "helped") {
        s.helped.push({ title: step.title, day: r.day });
        if (r.expectation === "low" || r.expectation === "unsure")
          s.surprises.push({ title: step.title, day: r.day });
      }
    }
  return s;
}
