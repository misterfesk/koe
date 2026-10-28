import { describe, expect, it } from "vitest";
import {
  confirmingTurn,
  fallbackTurn,
  followUpTurn,
  groundedCapture,
  hardDayTurn,
  literalInterviewCapture,
  openingTurn,
  replyIsSafe,
  whenFromAnswer,
  looksLikeWhen,
} from "@/domain/interview";
import {
  asksForMore,
  eatingSafe,
  hasAiTell,
  safeInterviewText,
  samplePlaceholder,
} from "@/domain/interview-text";
import {
  capturedThingSchema,
  fallbackTitle,
  readCaptured,
  tidyTitle,
  reviewDate,
  reviewDue,
  weekDraftSchema,
  whenLabel,
} from "@/domain/week";

const thing = capturedThingSchema.parse({
  what: "Updating my CV",
  title: "Update my CV",
});
describe("This week things and interview rules", () => {
  it("keeps only explicit current-thing replacements and the latest stated deadline", () => {
    expect(
      literalInterviewCapture(
        "Get fit.\nSorting my music playlist instead.\nDue Friday, now due Monday.",
        true,
      ),
    ).toEqual({ what: "Sorting my music playlist", when: "due Monday" });
    expect(literalInterviewCapture("Could I get fit instead?", true)).toEqual(
      {},
    );
  });
  it("stores what, when and a 1-60 character title, and nothing else", () => {
    const parsed = capturedThingSchema.parse({
      what: "Essay",
      title: "Finish my essay",
      stuck: "retired field",
    });
    expect(parsed).toEqual({
      what: "Essay",
      when: "",
      title: "Finish my essay",
    });
    expect(
      capturedThingSchema.safeParse({ what: "Essay", title: "x".repeat(61) })
        .success,
    ).toBe(false);
    expect(capturedThingSchema.safeParse({ what: "Essay" }).success).toBe(
      false,
    );
    expect(
      weekDraftSchema.parse({ items: [{ captured: thing, pieces: [] }] }),
    ).toEqual({ items: [{ captured: thing }] });
  });
  it("reads older rows leniently with a fallback title", () => {
    expect(
      readCaptured({
        what: "updating my CV. I open it, then close it again.",
        originalWhat: "x",
        done: "",
        left: "the opening",
        stuck: "words",
        when: "Friday",
      }),
    ).toEqual({
      what: "updating my CV. I open it, then close it again.",
      when: "Friday",
      title: "Updating my CV",
    });
    expect(readCaptured({ ...thing, extra: 1 })).toEqual(thing);
  });
  it.each([
    ["update my CV. I open it, then close it again.", "Update my CV"],
    ["sort the records!", "Sort the records"],
    [
      "write the long introduction for the community garden funding application",
      "Write the long introduction for the community garden funding",
    ],
    ["x".repeat(70), "X" + "x".repeat(59)],
    ["Email the landlord —", "Email the landlord"],
  ])("builds a fallback title from %s", (what, title) => {
    const result = fallbackTitle(what);
    expect(result).toBe(title);
    expect(result.length).toBeLessThanOrEqual(60);
  });
  it("labels deadlines without doubling by/due/before/on", () => {
    expect(whenLabel("Friday")).toBe("By Friday");
    expect(whenLabel("by the weekend")).toBe("By the weekend");
    expect(whenLabel("due Monday")).toBe("Due Monday");
    expect(whenLabel("on Tuesday")).toBe("On Tuesday");
    expect(whenLabel("This week")).toBe("This week");
    expect(whenLabel("next Monday")).toBe("Next Monday");
    expect(whenLabel("")).toBe("");
  });
  it.each([
    "You've got this",
    "one tiny thing",
    "We can do it",
    "Visit https://example.com",
    "Call 988",
    "Take medication",
    "Lose weight",
    "Steal a car",
  ])("rejects forbidden output: %s", (text) =>
    expect(safeInterviewText(text)).toBe(false),
  );
  it.each([
    "Update my CV — the opening",
    "It sounds like the CV is heavy",
    "That's a great start",
    "Absolutely, when is it due?",
    "Great question",
    "I hear you",
    "Here's an idea",
    "Let's dive in",
    "Go gently",
    "A gentle start",
    "Your writing journey",
    "Lean into the draft",
    "Unlock your week",
    "Empower yourself",
    "Be mindful of time",
    "Hold space for it",
  ])("rejects AI tells: %s", (text) => {
    expect(hasAiTell(text)).toBe(true);
    expect(safeInterviewText(text)).toBe(false);
  });
  it("allows ordinary deadlines, minute counts, the person's own words and plain AI disclosure", () => {
    expect(safeInterviewText("Spend 10 minutes reviewing the 2026 notes")).toBe(
      true,
    );
    expect(safeInterviewText("Koe is an AI, not a therapist.")).toBe(true);
    expect(safeInterviewText("Update my CV")).toBe(true);
    expect(safeInterviewText("Plan the next step for the project")).toBe(true);
  });
  it("keeps eating-sensitive titles free of food, exercise and weight", () => {
    expect(safeInterviewText("Get fit", true)).toBe(false);
    expect(safeInterviewText("Go for a run", true)).toBe(false);
    expect(safeInterviewText("Sort my playlist", true)).toBe(true);
  });
  it("uses the fixed copy for every deterministic turn", () => {
    expect(openingTurn()).toMatchObject({
      message: "What's one thing you'd like to get done this week?",
      ask: { kind: "text", placeholder: "e.g. Update my CV" },
    });
    expect(openingTurn().ask?.info).toBeUndefined();
    expect(followUpTurn()).toMatchObject({
      message: "When does it need to be done?",
      ask: {
        kind: "single",
        allowOther: true,
        placeholder: "e.g. Friday",
        options: [
          { label: "This week" },
          { label: "By the weekend" },
          { label: "No deadline" },
        ],
      },
    });
    expect(confirmingTurn().message).toBe(
      "Anything else you'd like to get done this week?",
    );
    expect(confirmingTurn().ask?.options).toEqual([
      { id: "add", label: "Add another" },
      { id: "finish", label: "That's enough for now" },
    ]);
    expect(confirmingTurn(false).ask?.options).toEqual([
      { id: "finish", label: "That's enough for now" },
    ]);
    expect(hardDayTurn(true)).toMatchObject({
      message: "Heavy day. Today can be really small.",
      ask: {
        options: [
          { id: "finish", label: "Add it to my week" },
          { id: "skip", label: "No plan today" },
        ],
      },
    });
    expect(hardDayTurn(false).ask?.options).toEqual([
      { id: "skip", label: "No plan today" },
    ]);
    for (const t of [
      openingTurn(),
      followUpTurn(),
      confirmingTurn(),
      hardDayTurn(true),
    ])
      expect(replyIsSafe(t)).toBe(true);
  });
  it("asks the deadline once, and skips it when one is already known", () => {
    expect(fallbackTurn(thing, 0).message).toBe(
      "When does it need to be done?",
    );
    expect(fallbackTurn(thing, 1).phase).toBe("confirming");
    expect(fallbackTurn({ ...thing, when: "Friday" }, 0).phase).toBe(
      "confirming",
    );
    expect(whenFromAnswer("No deadline")).toBe("");
    expect(whenFromAnswer("By the weekend")).toBe("By the weekend");
    for (const ok of [
      "Friday",
      "by the end of the month",
      "This week",
      "the 14th",
      "tonight",
    ])
      expect(looksLikeWhen(ok), ok).toBe(true);
    for (const no of [
      "Sorting the receipts for my tax return",
      "Also call my landlord about the boiler",
    ])
      expect(looksLikeWhen(no), no).toBe(false);
  });
  it("grounds what and when but lets the title rephrase", () => {
    expect(groundedCapture({ when: "Friday" }, "Essay due Friday")).toBe(true);
    expect(groundedCapture({ when: "Monday" }, "Essay due Friday")).toBe(false);
    expect(
      groundedCapture(
        { what: "Essay due Friday", title: "Finish the essay" },
        "Essay due Friday",
      ),
    ).toBe(true);
  });
  it("checks the title with the reply", () => {
    expect(
      replyIsSafe({ ...confirmingTurn(), captured: { title: "Your journey" } }),
    ).toBe(false);
  });
  it("uses a rolling week", () => {
    expect(reviewDate("2026-10-28")).toBe("2026-11-04");
    expect(reviewDue({ reviewOn: "2026-11-04" }, "2026-11-03")).toBe(false);
  });
  it.each([
    ["Finish my essay due Friday", "due Friday", "Finish my essay"],
    ["Finish my essay by Friday", "Friday", "Finish my essay"],
    ["Update my CV, by Thursday.", "by Thursday", "Update my CV"],
    ["Sort the papers by", "", "Sort the papers"],
    ["sorting my records", "", "Sorting my records"],
    ["Friday", "Friday", ""],
  ])("tidies the title %s (when %s)", (title, when, expected) =>
    expect(tidyTitle(title, when)).toBe(expected),
  );
  it.each([
    ["e.g., Friday", "e.g. Friday"],
    ["e.g. The opening paragraph", "e.g. The opening paragraph"],
    [
      "e.g., finish a work task, study for an hour, clean the kitchen",
      "e.g. Update my CV",
    ],
    ["e.g. the bills, or the letters", "e.g. Update my CV"],
    [undefined, "e.g. Update my CV"],
  ])("keeps one short placeholder sample: %s", (text, expected) =>
    expect(samplePlaceholder(text)).toBe(expected),
  );
  it("spots a model question about more things, and eating words", () => {
    expect(asksForMore.test("Anything else for this week?")).toBe(true);
    expect(asksForMore.test("Is there another thing on your mind?")).toBe(true);
    expect(asksForMore.test("When does the essay need to be done?")).toBe(
      false,
    );
    expect(eatingSafe("Get fit.")).toBe(false);
    expect(eatingSafe("Sorting my music playlist")).toBe(true);
  });
});
