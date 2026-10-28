import { describe, expect, it } from "vitest";
import { z } from "zod";
import { confirmingTurn, type InterviewHistory } from "../domain/interview";
import {
  actionGradePasses,
  actionGradeSchema,
  calibrationGradePasses,
  dialogueGradeSchema,
  dialogueVerdict,
  dialogueForGrading,
  type ActionGrade,
} from "./eval/interview-grading";

const positive: ActionGrade = {
  defects: [],
  note: "Writing three rough opening words directly advances the CV.",
};
describe("interview grading consistency", () => {
  it("does not reject a positive note denying unrelated work", () => {
    const note =
      "It does not repeat prior work, nor assume unsupported facts or involve unrelated work.";
    expect(actionGradePasses({ note, defects: [] })).toBe(true);
    expect(
      actionGradePasses({
        note,
        defects: [
          {
            code: "unrelated_action",
            reason: "Sorting papers does not advance the chosen CV update.",
          },
        ],
      }),
    ).toBe(false);
  });
  it("sends evidence before the verdict in the provider schema", () => {
    // Live calibration found verdict-first decoding rationalised acceptance of
    // every negative. Preserve ordering through the same Zod wire conversion.
    const wire = z.toJSONSchema(actionGradeSchema, { io: "input" });
    expect(Object.keys(wire.properties ?? {})).toEqual(["note", "defects"]);
  });
  it.each([
    "A is too vague; B is already done and insufficient.",
    "A is too vague and repeats existing behavior.",
    "The action is vague despite the five-minute limit.",
    "Opening the CV repeats what the person already does.",
  ])(
    "does not pass an empty defect list with a negative explanation: %s",
    (note) => {
      expect(actionGradePasses({ ...positive, note })).toBe(false);
    },
  );
  it("derives rejection from one canonical defect list", () => {
    expect(
      actionGradePasses({
        ...positive,
        defects: [
          { code: "scope_expansion", reason: "Only one shelf was requested" },
        ],
      }),
    ).toBe(false);
    expect(actionGradePasses(positive)).toBe(true);
  });
  it.each([
    "scope_expansion",
    "unrelated_action",
    "repeats_prior_piece",
    "time_conflict",
  ] as const)("rejects %s in later actions too", (code) => {
    expect(
      actionGradePasses({
        ...positive,
        defects: [
          {
            code,
            reason: "Supported by the original answer or prior proposal",
          },
        ],
      }),
    ).toBe(false);
  });
  it("rejects invented defect criteria instead of accepting arbitrary strings", () => {
    expect(
      actionGradeSchema.safeParse({
        ...positive,
        defects: [
          {
            code: "size_is_not_concrete",
            reason: "A label is not a physical action",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("requires positive acceptance and explicit negative rejection", () => {
    expect(calibrationGradePasses(positive, [])).toBe(true);
    expect(calibrationGradePasses(positive, ["vague_action"])).toBe(false);
    const rejected: ActionGrade = {
      note: "The action adds no meaningful change",
      defects: [
        {
          code: "repeats_completed_work",
          reason:
            "Only opening the CV adds no change to its opening paragraph.",
        },
      ],
    };
    expect(calibrationGradePasses(rejected, [])).toBe(false);
    expect(calibrationGradePasses(rejected, ["vague_action"])).toBe(true);
  });
  it("does not turn a negative note without defects into calibrated rejection", () => {
    const grade = {
      defects: [],
      note: "Opening the CV repeats what the person already does.",
    };
    expect(calibrationGradePasses(grade, ["repeats_completed_work"])).toBe(
      false,
    );
    expect(calibrationGradePasses(grade, [])).toBe(false);
  });
  it.each(["", "   ", "\n\t"])(
    "rejects an empty defect explanation: %j",
    (reason) => {
      const grade: ActionGrade = {
        note: "Rejected",
        defects: [{ code: "vague_action", reason }],
      };
      expect(actionGradeSchema.safeParse(grade).success).toBe(false);
      expect(calibrationGradePasses(grade, ["vague_action"])).toBe(false);
    },
  );
});

describe("dialogue grading consistency", () => {
  it("pins the canonical approval copy and its non-execution controls", () => {
    expect(confirmingTurn()).toEqual({
      message: "Want to break this into pieces for the week?",
      phase: "confirming",
      captured: {},
      ask: {
        kind: "single",
        allowOther: false,
        options: [
          { id: "propose", label: "Break it down" },
          { id: "add", label: "Add another thing" },
          { id: "finish", label: "That's enough for now" },
        ],
      },
    });
  });
  it("separates only an exact server-owned approval, preserving all other dialogue", () => {
    const history: InterviewHistory = [
      { role: "user", content: "Sorting my playlist instead." },
      { role: "assistant", content: "Which songs are already picked?" },
      { role: "user", content: "I can't do anything today." },
      { role: "assistant", content: "You must write the draft today." },
      { role: "assistant", content: confirmingTurn().message },
    ];
    const result = dialogueForGrading(history, [3, 4]);
    expect(result.dialogue).toEqual(history.slice(0, 4));
    expect(result.serverControls).toEqual([
      {
        historyIndex: 4,
        kind: "future_week_approval",
        executionRequestedToday: false,
      },
    ]);
    expect(history).toHaveLength(5);
  });
  it("retains matching user words, unmarked model text and modified approval text", () => {
    const history: InterviewHistory = [
      { role: "user", content: confirmingTurn().message },
      { role: "assistant", content: confirmingTurn().message },
      {
        role: "assistant",
        content: `${confirmingTurn().message} Start today.`,
      },
    ];
    expect(dialogueForGrading(history, [0, 2])).toEqual({
      dialogue: history,
      serverControls: [],
    });
  });
  it("derives both verdicts from explicit defects, preserving the evidence", () => {
    const grade = dialogueGradeSchema.parse({
      note: "Questions fit the essay opening and remain calm.",
      defects: [],
    });
    expect(dialogueVerdict(grade)).toEqual({
      note: grade.note,
      dialogueDefects: [],
      specific: true,
      appropriate: true,
    });
    const wire = z.toJSONSchema(dialogueGradeSchema, { io: "input" });
    expect(Object.keys(wire.properties ?? {})).toEqual(["note", "defects"]);
  });
  it.each([
    "unspecific",
    "not_brief_or_calm",
    "off_current_topic",
    "disregards_boundary",
  ] as const)(
    "keeps an explicit %s failure despite a positive note",
    (code) => {
      const grade = dialogueGradeSchema.parse({
        note: "The question is calm.",
        defects: [
          { code, reason: "A quoted dialogue failure remains recorded." },
        ],
      });
      const result = dialogueVerdict(grade);
      expect(result.specific).toBe(code !== "unspecific");
      expect(result.appropriate).toBe(code === "unspecific");
      expect(result.dialogueDefects).toEqual(grade.defects);
    },
  );
  it.each(["", "  "])("rejects a defect without evidence: %j", (reason) => {
    expect(
      dialogueGradeSchema.safeParse({
        note: "Rejected",
        defects: [{ code: "off_current_topic", reason }],
      }).success,
    ).toBe(false);
  });
  it("rejects free booleans instead of allowing a second conflicting verdict", () => {
    expect(
      dialogueGradeSchema.safeParse({
        note: "Questions fit the essay.",
        defects: [],
        appropriate: false,
      }).success,
    ).toBe(false);
  });
});
