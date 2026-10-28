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
  weekIssues,
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
      "Write three rough words for your CV",
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
    expect(fallbackPieces(thing, false, "One minute free.")[0].minutes).toBe(1);
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
  it("starts writing at the named opening instead of repeating the open-close loop", () => {
    const captured = capturedThingSchema.parse({
      what: "Updating my CV. I open it, then close it again.",
      stuck: "The opening paragraph feels too big.",
    });
    const [piece] = fallbackPieces(captured, false, "Nothing is written yet.");
    expect(piece.title).toBe(
      "Write three rough words for your CV's opening paragraph",
    );
    expect(piece.endpoint).toContain("three rough words");
    expect(piece.sourcePhrase).toBe(captured.stuck);
    expect(pieceIssues(piece, captured)).toEqual([]);
    const [fromAnswer] = fallbackPieces(
      { ...captured, stuck: "" },
      false,
      captured.stuck,
    );
    expect(fromAnswer.title).toBe(piece.title);
  });
  it("keeps one-shelf scope from original answers even when capture omits it", () => {
    const captured = capturedThingSchema.parse({
      what: "Maybe sorting my records.",
    });
    const [piece] = fallbackPieces(captured, false, "Only one shelf.");
    expect(piece.title).toBe(
      "Put two records from that one shelf in name order",
    );
    expect(piece.endpoint).toContain("that one shelf");
    expect(piece.sourcePhrase).toBe(captured.what);
    expect(pieceIssues(piece, captured, false, "Only one shelf.")).toEqual([]);
  });
  it("gives papers and a safe replacement playlist observable endpoints", () => {
    const papers = capturedThingSchema.parse({
      what: "Sort the appointment papers",
    });
    const [paper] = fallbackPieces(
      papers,
      false,
      "Only five minutes free at a time. The papers are in a pile.",
    );
    expect(paper.title).toBe(
      "Compare two appointment papers and group them by subject",
    );
    expect(paper.endpoint).toContain("Keep both");
    expect(paper.minutes).toBe(5);
    const playlist = capturedThingSchema.parse({
      what: "Sorting my music playlist",
    });
    const [song] = fallbackPieces(
      playlist,
      true,
      "Get fit. Sorting my music playlist instead. The songs are already picked.",
    );
    expect(song.title).toBe("Choose the first song for your playlist");
    expect(pieceIssues(song, playlist, true)).toEqual([]);
  });
  it("keeps unfamiliar work usable without claiming to resolve its explicit blocker", () => {
    const captured = capturedThingSchema.parse({
      what: "Repair the clock",
      stuck: "The mechanism is jammed",
    });
    const [piece] = fallbackPieces(captured);
    expect(piece.title).toContain("Name one unfinished part");
    expect(piece.sourcePhrase).toBe(captured.stuck);
    expect(pieceIssues(piece, captured)).toEqual([]);
    expect(piece.title).toMatch(/repair the clock/i);
  });
  it.each(["now", "later today", "tonight", "this evening"])(
    "rejects %s after a literal no-work-today answer omitted from capture",
    (when) => {
      const original =
        "I can't do anything today.\nOnly an unsent draft, not sending today.";
      const email = capturedThingSchema.parse({
        what: "Write the landlord email",
      });
      const [piece] = fallbackPieces(email, false, original);
      expect(piece.when).toBe("On a later day");
      expect(pieceIssues(piece, email, false, original)).toEqual([]);
      expect(pieceIssues({ ...piece, when }, email, false, original)).toContain(
        "not_today",
      );
      expect(
        pieceIssues(
          { ...piece, when: "Tomorrow, not today" },
          email,
          false,
          original,
        ),
      ).toEqual([]);
    },
  );
  it("uses captured broad timing limits while allowing drafts when only sending is deferred", () => {
    const email = capturedThingSchema.parse({
      what: "Write the landlord email",
      stuck: "I cannot work today.",
    });
    const [piece] = fallbackPieces(email);
    expect(piece.when).toBe("On a later day");
    expect(pieceIssues({ ...piece, when: "now" }, email)).toContain(
      "not_today",
    );
    const available = {
      ...email,
      stuck: "Only an unsent draft, not sending today.",
    };
    expect(
      pieceIssues({ ...fallbackPieces(available)[0], when: "now" }, available),
    ).toEqual([]);
    expect(
      pieceIssues(
        { ...fallbackPieces(available)[0], when: "later today" },
        available,
        false,
        "Not sending today.",
      ),
    ).toEqual([]);
  });
  it("requires a send request even when the endpoint also names a draft", () => {
    const email = capturedThingSchema.parse({
      what: "Write the landlord email",
    });
    const draft = fallbackPieces(email)[0];
    const sending = {
      ...draft,
      title: "Review and send email to landlord",
      endpoint: "Email sent from draft",
      when: "tomorrow",
    };
    expect(pieceIssues(sending, email)).toContain("contact");
    expect(
      pieceIssues({ ...sending, title: "Review the email draft" }, email),
    ).toContain("contact");
    expect(
      pieceIssues(sending, email, false, "Send the email tomorrow."),
    ).toEqual([]);
    expect(
      pieceIssues(sending, email, false, "Do not send the email."),
    ).toContain("contact");
    expect(pieceIssues(sending, email, false, "Not sending today.")).toContain(
      "contact",
    );
    expect(
      pieceIssues(
        { ...draft, endpoint: "Keep the draft unsent. Do not send today." },
        email,
      ),
    ).toEqual([]);
  });
  it("rejects the observed invented bill folder but allows an originally named folder", () => {
    const papers = capturedThingSchema.parse({
      what: "Sort the papers on my desk",
      stuck: "The bills are still mixed up",
    });
    const piece = {
      ...fallbackPieces(papers)[0],
      title: "File the sorted bills into your bill folder",
      endpoint: "All bills filed in the designated folder",
    };
    expect(pieceIssues(piece, papers, false, papers.what)).toContain(
      "invented_storage",
    );
    expect(
      pieceIssues(piece, papers, false, "The bill folder is on the desk."),
    ).toEqual([]);
    expect(
      pieceIssues(
        piece,
        { ...papers, left: "Put bills in the folder" },
        false,
        papers.what,
      ),
    ).toEqual([]);
  });
  it.each(["shelf", "drawer", "container"])(
    "requires existing %s to be named but permits new proposed storage",
    (noun) => {
      const papers = capturedThingSchema.parse({
        what: "Sort the papers on my desk",
      });
      const base = fallbackPieces(papers)[0];
      const piece = {
        ...base,
        title: `Put the sorted papers in your ${noun}`,
        endpoint: `Sorted papers in the designated ${noun}`,
      };
      expect(pieceIssues(piece, papers, false, papers.what)).toContain(
        "invented_storage",
      );
      expect(pieceIssues(piece, papers, false, `Use the ${noun}.`)).toEqual([]);
      expect(
        pieceIssues(
          {
            ...piece,
            title: `Create a new ${noun}`,
            endpoint: `The ${noun} is ready`,
          },
          papers,
          false,
          papers.what,
        ),
      ).toEqual([]);
    },
  );
  it("keeps original-only shelf facts and new groups distinct from invented storage", () => {
    const records = capturedThingSchema.parse({ what: "Sort my records" });
    const [piece] = fallbackPieces(records, false, "Only one shelf.");
    expect(pieceIssues(piece, records, false, "Only one shelf.")).toEqual([]);
    // Full-word owner approval passes; its captured-only transaction recheck
    // must not claim the originally named shelf was invented.
    expect(
      weekIssues({ items: [{ captured: records, pieces: [piece] }] }),
    ).toEqual([]);
    const changed = {
      ...piece,
      title: "Put the records in your folder",
      endpoint: "Records in the designated folder",
    };
    expect(pieceIssues(changed, records, false, "Only one shelf.")).toContain(
      "invented_storage",
    );
    expect(
      weekIssues({
        items: [
          {
            captured: records,
            pieces: [{ ...piece, minutes: 20, size: "tiny" }],
          },
        ],
      }),
    ).toContain("size");
    const papers = capturedThingSchema.parse({
      what: "Sort the papers on my desk",
    });
    expect(
      pieceIssues(
        {
          ...fallbackPieces(papers)[0],
          title: "Create two groups of papers",
          endpoint: "The two groups are separated on the desk",
        },
        papers,
        false,
        papers.what,
      ),
    ).toEqual([]);
  });
});
