import { beforeEach, describe, expect, it } from "vitest";
import {
  blankDraft,
  loadDraft,
  normalizeDraft,
  saveDraft,
  storable,
  toModel,
} from "@/features/intake/draft-store";
const key = "koe.intake.draft.v1";
beforeEach(() => sessionStorage.clear());
describe("lean intake drafts", () => {
  it("maps legacy later turns and excludes hidden answers", () => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        stage: 5,
        draft: {
          goals: ["sleep"],
          tone: ["expressive"],
          people: ["friend"],
          names: [{ name: "Sam", save: true }],
          support: ["doctor"],
          puttingOff: "Open the CV",
        },
      }),
    );
    const saved = loadDraft()!;
    expect(saved.stage).toBe(4);
    expect(toModel(saved.draft)).toMatchObject({
      goals: ["sleep"],
      puttingOff: "Open the CV",
      tone: "calm",
      people: [],
      names: [],
    });
    expect(toModel(saved.draft)).not.toHaveProperty("support");
    expect(saved.draft).not.toHaveProperty("names");
  });
  it("validates malformed field types and enum values", () => {
    expect(
      normalizeDraft({
        goals: "sleep",
        days: [null, "working", "caring"],
        wake: {},
        lifts: ["other", "music", "music", "bad"],
        puttingOff: {},
      }),
    ).toEqual({ ...blankDraft(), days: ["working"], lifts: ["music"] });
    for (const raw of [
      "{",
      "null",
      '{"stage":1.5,"draft":{}}',
      '{"stage":2,"draft":[]}',
      '{"stage":6,"draft":{}}',
    ]) {
      sessionStorage.setItem(key, raw);
      expect(loadDraft()).toBeNull();
    }
  });
  it("drops risky text on write and read and preserves eating protections", () => {
    const draft = {
      ...blankDraft(),
      goalsNote: "I want to end it all",
      dayNote: "I hate my body and I'm restricting",
    };
    const safe = storable(draft);
    expect(safe.goalsNote).toBe("");
    expect(safe.dayNote).toBe("");
    expect(safe.eatingConcern).toBe(true);
    saveDraft({ version: 2, stage: 3, draft });
    expect(sessionStorage.getItem(key)).not.toContain("end it all");
    expect(loadDraft()).toEqual({ version: 2, stage: 3, draft: safe });
  });
  it("keeps lean progress and caps selections and text", () => {
    const draft = normalizeDraft({
      goals: ["sleep", "energy", "basics"],
      puttingOff: "a".repeat(250),
    });
    saveDraft({ version: 2, stage: 4, draft });
    expect(loadDraft()?.draft.goals).toEqual(["sleep", "energy"]);
    expect(loadDraft()?.draft.puttingOff).toHaveLength(200);
  });
});

it("fits two long day notes without truncating accepted text during mapping", () => {
  const draft = normalizeDraft({
    dayNote: "a".repeat(120),
    wakeNote: "b".repeat(72),
  });
  expect(toModel(draft).notes?.day).toBe(
    `${"a".repeat(120)}. Wake: ${"b".repeat(72)}`,
  );
  expect(toModel(draft).notes?.day).toHaveLength(200);
  sessionStorage.setItem(
    key,
    JSON.stringify({
      stage: 4,
      draft: { dayNote: "a".repeat(180), wakeNote: "b".repeat(180) },
    }),
  );
  const restored = loadDraft()!;
  expect(restored.stage).toBe(2);
  expect(restored.notice).toContain("Check them");
  expect(toModel(restored.draft).notes?.day).toHaveLength(200);
});

it("never attributes unscoped or another owner's words to the current person", () => {
  saveDraft({
    version: 2,
    stage: "interview",
    draft: { ...blankDraft(), puttingOff: "Open the CV" },
  });
  expect(loadDraft("a")).toBeNull();
  saveDraft(
    {
      version: 2,
      stage: "interview",
      draft: { ...blankDraft(), puttingOff: "Open the CV" },
    },
    "a",
  );
  expect(loadDraft("b")).toBeNull();
  expect(loadDraft("a")?.stage).toBe("interview");
  saveDraft(
    { version: 2, stage: 2, draft: { ...blankDraft(), goals: ["sleep"] } },
    "b",
  );
  expect(loadDraft("a")?.draft.puttingOff).toBe("Open the CV");
  expect(loadDraft("b")?.draft.goals).toEqual(["sleep"]);
});
