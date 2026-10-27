import { describe, expect, it } from "vitest";
import {
  FREE_TEXT_MAX,
  freeTexts,
  hasLifts,
  intakeModel,
  isEmptyModel,
} from "@/domain/intake";

describe("the intake model", () => {
  it("accepts nothing at all: every question is skippable", () => {
    const m = intakeModel.parse({});
    expect(m.goals).toEqual([]);
    expect(m.lifts).toEqual([]);
    expect(m.names).toEqual([]);
    expect(m.eatingConcern).toBe(false);
    expect(isEmptyModel(m)).toBe(true);
  });

  it("limits goals to two and drops duplicates", () => {
    expect(
      intakeModel.safeParse({ goals: ["sleep", "energy", "basics"] }).success,
    ).toBe(false);
    expect(intakeModel.parse({ goals: ["sleep", "sleep"] }).goals).toEqual([
      "sleep",
    ]);
  });

  it("rejects values outside the choices", () => {
    expect(intakeModel.safeParse({ wake: "noon" }).success).toBe(false);
    expect(intakeModel.safeParse({ lifts: ["skydiving"] }).success).toBe(false);
    expect(intakeModel.safeParse({ morningPlan: "06:00" }).success).toBe(false);
  });

  it("keeps free text short and treats blank as no answer", () => {
    expect(
      intakeModel.safeParse({ puttingOff: "x".repeat(FREE_TEXT_MAX + 1) })
        .success,
    ).toBe(false);
    const m = intakeModel.parse({ puttingOff: "   ", notes: { goals: "" } });
    expect(m.puttingOff).toBeUndefined();
    expect(m.notes.goals).toBeUndefined();
  });

  it("takes names with a save tick, at most three", () => {
    const m = intakeModel.parse({
      names: [{ name: " Sam ", save: true }, { name: "Priya" }],
    });
    expect(m.names).toEqual([
      { name: "Sam", save: true },
      { name: "Priya", save: false },
    ]);
    expect(
      intakeModel.safeParse({
        names: [1, 2, 3, 4].map((n) => ({ name: "n" + n })),
      }).success,
    ).toBe(false);
  });

  it("lists every free-text value for the safety check", () => {
    const m = intakeModel.parse({
      puttingOff: "the dentist",
      notes: { lifts: "my guitar" },
      names: [{ name: "Sam" }],
    });
    expect(freeTexts(m).sort()).toEqual(["Sam", "my guitar", "the dentist"]);
  });

  it("counts a note about what lifts them as something that lifts", () => {
    expect(hasLifts(intakeModel.parse({}))).toBe(false);
    expect(
      hasLifts(intakeModel.parse({ notes: { lifts: "old records" } })),
    ).toBe(true);
    expect(hasLifts(intakeModel.parse({ lifts: ["other"] }))).toBe(true);
  });
});
