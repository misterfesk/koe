import { describe, expect, it } from "vitest";
import { activities, librarySmaller, suggestions } from "@/domain/activities";
import { patterns, weekSummary, MIN_RATINGS } from "@/domain/journey";
import {
  isDue,
  stepInput,
  todayPlan,
  upcoming,
  type ReportView,
  type StepView,
} from "@/domain/steps";

let n = 0;
function step(over: Partial<StepView> = {}): StepView {
  n++;
  return {
    id: "s" + n,
    area: "move",
    title: "Walk to the corner " + n,
    cue: null,
    expectation: null,
    problem: null,
    status: "active",
    repeatDays: null,
    plannedFor: "2026-10-26",
    version: 1,
    sourceMemoryId: null,
    kind: null,
    minuteOfDay: null,
    why: null,
    size: null,
    origin: null,
    createdAt: "2026-10-20T00:00:00Z",
    reports: [],
    versions: [],
    ...over,
  };
}
function report(over: Partial<ReportView> = {}): ReportView {
  n++;
  return {
    id: "r" + n,
    version: 1,
    day: "2026-10-26",
    outcome: "done",
    helped: null,
    expectation: null,
    barrier: null,
    note: null,
    ...over,
  };
}

const MONDAY = "2026-10-26";

describe("what Today shows", () => {
  it("shows one-off steps from their planned day, and repeats on their days", () => {
    expect(isDue(step({ plannedFor: MONDAY }), MONDAY)).toBe(true);
    expect(isDue(step({ plannedFor: "2026-10-27" }), MONDAY)).toBe(false);
    expect(isDue(step({ plannedFor: "2026-10-20" }), MONDAY)).toBe(true);
    expect(isDue(step({ repeatDays: [1, 3] }), MONDAY)).toBe(true);
    expect(isDue(step({ repeatDays: [2] }), MONDAY)).toBe(false);
    expect(isDue(step({ status: "paused" }), MONDAY)).toBe(false);
  });

  it("moves a step from waiting to reported once it has an answer today", () => {
    const waiting = step();
    const done = step({ status: "finished", reports: [report()] });
    const yesterday = step({
      repeatDays: [1],
      reports: [report({ day: "2026-10-19" })],
    });
    const plan = todayPlan([waiting, done, yesterday], MONDAY);
    expect(plan.waiting.map((s) => s.id)).toEqual([waiting.id, yesterday.id]);
    expect(plan.reported.map((r) => r.step.id)).toEqual([done.id]);
  });

  it("lists steps planned for other days as upcoming", () => {
    const later = step({ plannedFor: "2026-10-28" });
    const repeat = step({ repeatDays: [3] });
    expect(upcoming([later, repeat, step()], MONDAY).map((s) => s.id)).toEqual([
      later.id,
      repeat.id,
    ]);
  });
});

describe("step input", () => {
  it("needs words, and days when repeating", () => {
    expect(
      stepInput.safeParse({ area: "do", title: "  ", when: "today" }).success,
    ).toBe(false);
    const repeat = stepInput.safeParse({
      area: "do",
      title: "Tidy one shelf",
      when: "repeat",
      repeatDays: [],
    });
    expect(repeat.success).toBe(false);
    const ok = stepInput.safeParse({
      area: "do",
      title: "Tidy one shelf",
      cue: "  ",
      when: "today",
    });
    expect(ok.success && ok.data.cue).toBe(null);
  });
});

describe("suggestions", () => {
  it("sizes library suggestions to a low-energy day", () => {
    const list = suggestions([], "low", 0);
    expect(list.length).toBeGreaterThan(5);
    const low = new Set(
      activities.filter((a) => a.energy === "low").map((a) => a.title),
    );
    expect(list.every((s) => low.has(s.title))).toBe(true);
    expect(list.every((s) => s.because.length > 0)).toBe(true);
  });

  it("puts steps the person said helped first, with the reason", () => {
    const helped = step({
      title: "Call Sam",
      status: "finished",
      reports: [report({ helped: "helped" })],
    });
    const [first] = suggestions([helped], "okay", 0);
    expect(first.title).toBe("Call Sam");
    expect(first.because).toMatch(/helped/);
  });

  it("knows a smaller version of library activities", () => {
    expect(librarySmaller("Drink a glass of water")).toBe(
      "Fill a glass and put it beside you",
    );
    expect(librarySmaller("Something unknown")).toBeNull();
  });
});

describe("journey counts", () => {
  it("shows nothing until there are enough rated steps", () => {
    const s = step({
      reports: Array.from({ length: MIN_RATINGS - 1 }, () =>
        report({ helped: "helped" }),
      ),
    });
    expect(patterns([s], [])).toEqual([]);
  });

  it("counts what helped by area and when it beat expectations", () => {
    const s = step({
      area: "move",
      reports: [
        report({ helped: "helped", expectation: "low" }),
        report({ helped: "helped", expectation: "unsure" }),
        report({ helped: "helped" }),
        report({ helped: "same" }),
        report({ helped: "helped" }),
      ],
    });
    const found = patterns([s], []);
    expect(found.map((p) => p.key)).toEqual([
      "area:move",
      "surprise",
      "step:" + s.id,
    ]);
    expect(found[0].text).toBe("Move: you said 4 of 5 rated steps helped.");
    expect(patterns([s], ["surprise"]).map((p) => p.key)).not.toContain(
      "surprise",
    );
  });

  it("summarises a week without counting skipped answers", () => {
    const s = step({
      reports: [
        report({ day: "2026-10-26", outcome: "done", helped: "helped" }),
        report({ day: "2026-10-25", outcome: "partly" }),
        report({ day: "2026-10-24", outcome: "skip" }),
        report({ day: "2026-10-10", outcome: "done" }),
      ],
    });
    const w = weekSummary([s], "2026-10-20", MONDAY);
    expect([w.answered, w.done, w.partly, w.not]).toEqual([2, 1, 1, 0]);
    expect(w.helped).toHaveLength(1);
  });
});
