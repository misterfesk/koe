import { describe, expect, it } from "vitest";
import {
  confirmingTurn,
  openingTurn,
  replyIsSafe,
  groundedCapture,
  fallbackTurn,
  literalInterviewCapture,
} from "@/domain/interview";
import {
  fallbackPieces,
  pieceIssues,
  safeInterviewText,
  statedAvailabilityMinutes,
} from "@/domain/piece-rules";
import {
  capturedThingSchema,
  pieceSchema,
  reviewDate,
  reviewDue,
  whatMoved,
} from "@/domain/week";

const thing = capturedThingSchema.parse({
  what: "Updating my CV",
  left: "the opening paragraph",
  stuck: "choosing words",
});
describe("weekly pieces and interview rules", () => {
  it("names the thing rather than treating a status answer as the action", () => {
    const item = capturedThingSchema.parse({
      what: "Updating my CV",
      left: "Nothing is written yet",
    });
    expect(fallbackPieces(item)[0].title).toBe(
      "Spend 10 minutes on updating your CV",
    );
    expect(fallbackPieces(item)[0].title).not.toMatch(/nothing is written/i);
  });
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
  it("checks sizes and exact source grounding", () => {
    const p = fallbackPieces(thing)[0];
    expect(pieceIssues(p, thing)).toEqual([]);
    expect(pieceIssues({ ...p, size: "tiny", minutes: 6 }, thing)).toContain(
      "size",
    );
    expect(
      pieceIssues({ ...p, sourcePhrase: "an invented deadline" }, thing),
    ).toContain("source");
    expect(pieceSchema.safeParse({ ...p, minutes: 26 }).success).toBe(false);
    expect(pieceSchema.safeParse({ ...p, endpoint: "" }).success).toBe(false);
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
  it("allows ordinary deadlines and minute counts, and plain AI disclosure", () => {
    expect(safeInterviewText("Spend 10 minutes reviewing the 2026 notes")).toBe(
      true,
    );
    expect(safeInterviewText("Koe is an AI, not a therapist.")).toBe(true);
  });
  it("keeps every deterministic question safe and under the follow-up budget", () => {
    for (const t of [
      openingTurn(),
      fallbackTurn(thing, 0),
      fallbackTurn(thing, 1),
      fallbackTurn(thing, 2),
      confirmingTurn(),
    ])
      expect(replyIsSafe(t)).toBe(true);
    expect(fallbackTurn(thing, 2).phase).toBe("confirming");
    expect(groundedCapture({ when: "Friday" }, "Essay due Friday")).toBe(true);
    expect(groundedCapture({ when: "Monday" }, "Essay due Friday")).toBe(false);
  });
  it("keeps fallback contact work unsent and eating-sensitive work excluded", () => {
    const email = capturedThingSchema.parse({ what: "email the landlord" });
    expect(fallbackPieces(email)[0].title).toMatch(/unsent/);
    expect(pieceIssues(fallbackPieces(email)[0], email)).toEqual([]);
    expect(
      fallbackPieces(capturedThingSchema.parse({ what: "get fit" }), true),
    ).toEqual([]);
    expect(fallbackPieces(thing, true)).toHaveLength(1);
    const sending = {
      ...fallbackPieces(email)[0],
      title: "Send the email",
      endpoint: "Stop after sending",
    };
    expect(pieceIssues(sending, email)).toContain("contact");
    expect(pieceIssues(sending, { ...email, left: "send the email" })).toEqual(
      [],
    );
    expect(
      pieceIssues(sending, { ...email, left: "not sending today" }),
    ).toContain("contact");
  });
  it("uses a rolling week and counts only done pieces", () => {
    expect(reviewDate("2026-10-28")).toBe("2026-11-04");
    expect(reviewDue({ reviewOn: "2026-11-04" }, "2026-11-03")).toBe(false);
    expect(
      whatMoved({
        id: "w",
        version: 1,
        startedOn: "2026-10-28",
        reviewOn: "2026-11-04",
        items: [
          {
            id: "i",
            captured: thing,
            pieces: [
              {
                ...fallbackPieces(thing)[0],
                id: "p",
                status: "done",
                order: 0,
              },
            ],
          },
        ],
      }),
    ).toBe(1);
  });
  it("uses only explicitly stated availability, including original answers", () => {
    expect(statedAvailabilityMinutes(thing)).toBeNull();
    expect(
      statedAvailabilityMinutes(thing, "Only five minutes free at a time."),
    ).toBe(5);
    expect(statedAvailabilityMinutes(thing, "I only have 3 minutes.")).toBe(3);
    expect(
      statedAvailabilityMinutes(thing, "I can spare twenty-one minutes."),
    ).toBe(21);
    for (const words of [
      "Due in five minutes.",
      "Five minutes are already done.",
      "Only one shelf.",
      "I used to have only five minutes.",
      "Not only five minutes free.",
    ])
      expect(statedAvailabilityMinutes(thing, words)).toBeNull();
    const fallback = fallbackPieces(
      thing,
      false,
      "Only five minutes free at a time.",
    )[0];
    expect(fallback.minutes).toBe(5);
    expect(fallback.size).toBe("tiny");
    expect(
      pieceIssues(
        { ...fallback, minutes: 10, size: "small" },
        thing,
        false,
        "Only five minutes free at a time.",
      ),
    ).toContain("availability");
    expect(fallbackPieces(thing)[0].minutes).toBe(10);
    expect(fallbackPieces(thing, false, "One minute free.")[0].title).toContain(
      "1 minute on",
    );
  });
  it.each([
    "Toss the loose papers",
    "Recycle the papers",
    "Shred the papers",
    "Discard the papers",
    "Throw the papers away",
    "Delete the file",
  ])(
    "requires explicit permission for destructive suggestions: %s",
    (title) => {
      const papers = capturedThingSchema.parse({
        what: "Sort the appointment papers",
      });
      const p = {
        ...fallbackPieces(papers)[0],
        title,
        endpoint: "Stop after this pile",
      };
      expect(pieceIssues(p, papers)).toContain("destructive");
    },
  );
  it("permits requested disposal but treats questions and negation conservatively", () => {
    const papers = capturedThingSchema.parse({
      what: "Sort the appointment papers",
    });
    const p = {
      ...fallbackPieces(papers)[0],
      title: "Shred the junk mail",
      endpoint: "Stop after the junk mail",
    };
    expect(pieceIssues(p, papers, false, "Shred the junk mail.")).not.toContain(
      "destructive",
    );
    for (const words of [
      "Don't shred the papers.",
      "Don’t shred the papers.",
      "Should I shred these?",
      "Already shredded the papers.",
    ])
      expect(pieceIssues(p, papers, false, words)).toContain("destructive");
    expect(
      pieceIssues(
        { ...p, title: "Keep every paper", endpoint: "Do not shred anything" },
        papers,
      ),
    ).not.toContain("destructive");
  });
  it("keeps unsent-message examples out of essays and playlists", () => {
    for (const what of ["Finish the essay", "Sort your music playlist"]) {
      const captured = capturedThingSchema.parse({ what });
      expect(
        pieceIssues(
          {
            ...fallbackPieces(captured)[0],
            title: "Draft two unsent lines",
            endpoint: "Stop with two unsent lines",
          },
          captured,
        ),
      ).toContain("unrelated_message");
    }
    const email = capturedThingSchema.parse({
      what: "Write the landlord email",
    });
    expect(pieceIssues(fallbackPieces(email)[0], email)).toEqual([]);
  });
});
