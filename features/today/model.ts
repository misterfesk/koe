import type { PlanKind, PlanSize } from "@/domain/plan-menu";
import type { Outcome, VsExpected } from "@/domain/steps";

/** One entry on Today's timeline, ready to show (times already formatted). */
export type Entry = {
  id: string;
  title: string;
  why: string | null;
  kind: PlanKind | null;
  kindLabel: string;
  size: PlanSize | null;
  /** Local time as the person's locale writes it; null when untimed. */
  time: string | null;
  minute: number | null;
  /** Part of today's plan, so "Not today" offers the full set of options. */
  inPlan: boolean;
  /** Days a repeating entry from before the plan came, if any. */
  repeats: string | null;
  report: {
    id: string;
    outcome: Outcome;
    vsExpected: VsExpected | null;
  } | null;
  later: { label: string; minute: number; time: string }[];
};

export type Banner = {
  note: string;
  lines: string[];
  canUndo: boolean;
};
