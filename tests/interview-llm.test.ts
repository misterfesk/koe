// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { capturedThingSchema } from "@/domain/week";
import { fallbackPieces } from "@/domain/piece-rules";
import { fallbackTurn } from "@/domain/interview";
import type { InterviewContext } from "@/server/llm/interview";
const model = vi.hoisted(() => ({
  ai: "on",
  output: null as unknown,
  fail: false,
  calls: [] as {
    messages: { content: string }[];
    options: Record<string, unknown>;
  }[],
  validationMessages: [] as string[],
}));
vi.mock("@/server/env", () => ({
  env: () => ({
    KOE_AI: model.ai,
    KOE_CHAT_MODEL: "nvidia/Nemotron-3-Ultra-550b-a55b",
  }),
}));
vi.mock("@/server/llm/nebius", () => ({
  completeJson: async (
    messages: { content: string }[],
    schema: z.ZodType,
    options: Record<string, unknown>,
  ) => {
    model.calls.push({ messages, options });
    if (model.fail) throw new Error("provider down");
    const parsed = schema.safeParse(model.output);
    if (!parsed.success) {
      model.validationMessages.push(
        ...parsed.error.issues.map((issue) => issue.message),
      );
      throw parsed.error;
    }
    return parsed.data;
  },
}));
const ctx: InterviewContext = {
  intake: {},
  eatingConcern: false,
  thing: capturedThingSchema.parse({
    what: "Updating my CV",
    stuck: "the opening paragraph",
  }),
  followups: 0,
  turnsLeft: 8,
};
function distinctWritingPieces(base = fallbackPieces(ctx.thing)[0]) {
  return [
    {
      ...base,
      title: "Write three rough opening words",
      endpoint: "Three rough opening words written",
    },
    {
      ...base,
      title: "Expand the words into an opening sentence",
      endpoint: "One rough opening sentence written",
    },
    {
      ...base,
      title: "Revise one word in the opening sentence",
      endpoint: "One word in the opening sentence revised",
    },
  ];
}
beforeEach(() => {
  model.ai = "on";
  model.fail = false;
  model.calls = [];
  model.validationMessages = [];
  model.output = fallbackTurn(ctx.thing, 0);
});
describe("interview model contract", () => {
  it("keeps a reply field available when a checked gathering turn omits ask", async () => {
    model.output = {
      message: "Which part of the CV feels hardest?",
      phase: "gathering",
      captured: {},
    };
    const { interviewTurn } = await import("@/server/llm/interview");
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(result.source).toBe("ai");
    expect(result.turn.ask).toMatchObject({ kind: "text", allowOther: false });
  });
  it("tells the repair retry which piece constraint failed", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    model.output = {
      pieces: Array.from({ length: 3 }, () => ({
        ...fallbackPieces(ctx.thing)[0],
        title: "Shred the papers",
        endpoint: "Papers shredded",
      })),
    };
    await breakDown(ctx);
    expect(model.validationMessages).toContain(
      "No destruction was requested. Propose sorting and keeping instead.",
    );
    model.validationMessages = [];
    model.output = {
      pieces: Array.from({ length: 3 }, () => ({
        ...fallbackPieces(ctx.thing)[0],
        minutes: 10,
        size: "small",
      })),
    };
    await breakDown({
      ...ctx,
      originalWords: "Only five minutes free at a time.",
    });
    expect(model.validationMessages).toContain(
      "Every piece must fit the person's stated available minutes.",
    );
  });
  it("keeps an explicit replacement and deadline through a provider failure", async () => {
    model.fail = true;
    const { interviewTurn } = await import("@/server/llm/interview");
    const result = await interviewTurn(
      [{ role: "user", content: "Sorting my music playlist instead." }],
      {
        ...ctx,
        eatingConcern: true,
        originalWords:
          "Get fit.\nSorting my music playlist instead.\nFinish by Friday.",
      },
    );
    expect(result.source).toBe("fallback");
    expect(result.turn.captured).toMatchObject({
      what: "Sorting my music playlist",
      when: "by Friday",
    });
  });
  it("routes turns and breakdowns to Ultra with distinct logged purposes", async () => {
    const llm = await import("@/server/llm/interview");
    expect(
      (
        await llm.interviewTurn(
          [{ role: "user", content: "Updating my CV" }],
          ctx,
        )
      ).source,
    ).toBe("ai");
    model.output = {
      pieces: distinctWritingPieces(),
    };
    expect((await llm.breakDown(ctx)).source).toBe("ai");
    expect(model.calls.map((c) => c.options.purpose)).toEqual([
      "interview_turn",
      "interview_breakdown",
    ]);
    expect(
      model.calls.every(
        (c) => c.options.model === "nvidia/Nemotron-3-Ultra-550b-a55b",
      ),
    ).toBe(true);
  });
  it("rejects unsafe messages, options and invented captured facts", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    for (const invalid of [
      { ...fallbackTurn(ctx.thing, 0), message: "We've got this" },
      {
        ...fallbackTurn(ctx.thing, 0),
        ask: {
          kind: "single",
          allowOther: true,
          options: [{ id: "x", label: "Take medication" }],
        },
      },
      { ...fallbackTurn(ctx.thing, 0), captured: { when: "Friday" } },
    ]) {
      model.output = invalid;
      expect(
        (
          await interviewTurn(
            [{ role: "user", content: "Updating my CV" }],
            ctx,
          )
        ).source,
      ).toBe("fallback");
    }
  });
  it("keeps an explicit deadline and captures the last answer before confirming", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...fallbackTurn(ctx.thing, 0),
      captured: { stuck: "choosing the opening words" },
    };
    const result = await interviewTurn(
      [
        { role: "user", content: "Finish an essay due Friday." },
        { role: "user", content: "choosing the opening words" },
      ],
      { ...ctx, followups: 2 },
    );
    expect(result.turn.phase).toBe("confirming");
    expect(result.turn.captured.stuck).toBe("choosing the opening words");
    expect(result.turn.captured.when).toBe("due Friday");
    expect(result.turn.message).toBe(
      "Want to break this into pieces for the week?",
    );
  });
  it("falls back on provider failure and enforces eating and caring constraints", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    model.fail = true;
    expect((await breakDown(ctx)).pieces).toHaveLength(1);
    model.fail = false;
    model.output = {
      pieces: Array.from({ length: 3 }, () => ({
        ...fallbackPieces(ctx.thing)[0],
        title: "Run around the block",
        size: "medium",
        minutes: 20,
      })),
    };
    expect((await breakDown({ ...ctx, caring: true })).source).toBe("fallback");
    expect((await breakDown({ ...ctx, eatingConcern: true })).source).toBe(
      "fallback",
    );
  });
  it("does not call the provider with AI off and bounds prompt context", async () => {
    const { interviewTurn, breakDown } = await import("@/server/llm/interview");
    model.ai = "off";
    await interviewTurn([], ctx);
    await breakDown(ctx);
    expect(model.calls).toHaveLength(0);
    model.ai = "on";
    await interviewTurn(
      Array.from({ length: 30 }, () => ({
        role: "user" as const,
        content: "words ".repeat(400),
      })),
      ctx,
    );
    expect(model.calls[0].messages).toHaveLength(13);
    expect(
      model.calls[0].messages.reduce((n, m) => n + m.content.length, 0),
    ).toBeLessThanOrEqual(11300);
  });
  it("rejects later pieces above explicit availability and keeps the local fallback within it", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const p = fallbackPieces(ctx.thing)[0];
    model.output = { pieces: [p, p, p] };
    const result = await breakDown({
      ...ctx,
      originalWords: "Only five minutes free at a time.",
    });
    expect(result.source).toBe("fallback");
    expect(result.pieces[0].minutes).toBe(5);
    model.output = {
      pieces: distinctWritingPieces(p).map((piece) => ({
        ...piece,
        size: "tiny",
        minutes: 5,
      })),
    };
    expect(
      (
        await breakDown({
          ...ctx,
          originalWords: "Only five minutes free at a time.",
        })
      ).source,
    ).toBe("ai");
  });
  it("repairs unrelated unsent drafts and unrequested destruction through schema rejection", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    for (const title of [
      "Draft two unsent lines",
      "Recycle the loose papers",
    ]) {
      model.output = {
        pieces: Array.from({ length: 3 }, () => ({
          ...fallbackPieces(ctx.thing)[0],
          title,
        })),
      };
      expect((await breakDown(ctx)).source).toBe("fallback");
    }
  });
  it("keeps bounded original answers ahead of optional intake details in model context", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    model.output = {
      pieces: Array.from({ length: 3 }, () => fallbackPieces(ctx.thing)[0]),
    };
    await breakDown({
      ...ctx,
      intake: { notes: "unused ".repeat(2000), goals: ["work_study"] },
      originalWords:
        "Only one shelf. Only five minutes free. " + "x".repeat(4000),
    });
    const sent = JSON.parse(model.calls[0].messages[1].content);
    expect(sent.originalWords).toHaveLength(1600);
    expect(sent.originalWords).toContain("Only one shelf");
    expect(sent.intake.notes).toBeUndefined();
    expect(model.calls[0].messages[0].content).toContain(
      "do not invent digital files",
    );
  });
  it.each(["off", "provider failure"])(
    "keeps final scope words in the concrete fallback with %s",
    async (failure) => {
      model.ai = failure === "off" ? "off" : "on";
      model.fail = failure === "provider failure";
      const { breakDown } = await import("@/server/llm/interview");
      const result = await breakDown({
        ...ctx,
        thing: capturedThingSchema.parse({ what: "Maybe sorting my records." }),
        originalWords:
          "I don't know, everything.\nMaybe sorting my records.\nOnly one shelf.",
      });
      expect(result.source).toBe("fallback");
      expect(result.pieces[0].title).toBe(
        "Put two records from that one shelf in name order",
      );
      expect(result.pieces[0].sourcePhrase).toBe("Maybe sorting my records.");
    },
  );
  it("rejects later pieces scheduled today and gives the retry a timing correction", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const originalWords = "I can't do anything today.";
    const later = fallbackPieces(ctx.thing, false, originalWords)[0];
    model.output = {
      pieces: [later, later, { ...later, when: "later today" }],
    };
    const result = await breakDown({ ...ctx, originalWords });
    expect(result.source).toBe("fallback");
    expect(result.pieces[0].when).toBe("On a later day");
    expect(model.validationMessages).toContain(
      "Work is unavailable today. Suggest a later day for every piece, including unsent drafts.",
    );
    model.output = {
      pieces: distinctWritingPieces(later).map((piece) => ({
        ...piece,
        when: "tomorrow",
      })),
    };
    expect((await breakDown({ ...ctx, originalWords })).source).toBe("ai");
  });
  it("rejects a sending action hidden behind a draft endpoint and explains the repair", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const thing = capturedThingSchema.parse({
      what: "Write the landlord email",
    });
    const draft = fallbackPieces(thing)[0];
    model.output = {
      pieces: [
        draft,
        draft,
        {
          ...draft,
          title: "Review and send email to landlord",
          endpoint: "Email sent from draft",
        },
      ],
    };
    const result = await breakDown({
      ...ctx,
      thing,
      originalWords: "Only an unsent draft, not sending today.",
    });
    expect(result.source).toBe("fallback");
    expect(model.validationMessages).toContain(
      "Use an unsent draft. Sending requires an explicit request.",
    );
    expect(result.pieces[0].title).toContain("unsent");
  });
  it.each([
    "One rough sentence exists in the document",
    "  ONE rough sentence   exists in the document!  ",
    "One rough sentence exists in the document…",
    "One deliberately rough sentence exists in the document",
    "One sentence exists in the document",
  ])(
    "rejects duplicate outcomes with different Write/Draft titles: %s",
    async (endpoint) => {
      const { breakDown } = await import("@/server/llm/interview");
      const pieces = distinctWritingPieces();
      pieces[0] = {
        ...pieces[0],
        title: "Write one rough opening sentence for the CV",
        endpoint: "One rough sentence exists in the document",
      };
      pieces[2] = {
        ...pieces[2],
        title: "Draft one rough opening sentence for the CV",
        endpoint,
      };
      model.output = { pieces };
      const result = await breakDown(ctx);
      expect(result.source).toBe("fallback");
      expect(result.pieces).toEqual(fallbackPieces(ctx.thing));
      expect(model.validationMessages).toContain(
        "Give each piece a different result. Expand, revise, or add to earlier work.",
      );
    },
  );
  it("rejects leaving sorted bills unchanged after they are already grouped", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const thing = capturedThingSchema.parse({
      what: "Sort the papers on my desk.",
      stuck: "The bills are still mixed up.",
    });
    const base = fallbackPieces(thing)[0];
    model.output = {
      pieces: [
        {
          ...base,
          title: "Pull out every bill and set it in one pile",
          endpoint: "All bills are in a single stack on the desk",
        },
        {
          ...base,
          title:
            "Sort the bill pile into categories like utilities and medical",
          endpoint: "Bills grouped by type in separate stacks on the desk",
        },
        {
          ...base,
          title: "Leave each sorted stack in its own pile on the desk",
          endpoint: "Each bill category stays in a separate pile on the desk",
        },
      ],
    };
    const result = await breakDown({ ...ctx, thing });
    expect(result.source).toBe("fallback");
    expect(result.pieces).toEqual(fallbackPieces(thing));
    expect(model.validationMessages).toContain(
      "Keeping an earlier result unchanged is not another piece. Add a concrete change within the person's scope.",
    );
  });
  it("accepts added words, revision, and continued writing with distinct results", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const pieces = distinctWritingPieces();
    pieces[1] = {
      ...pieces[1],
      title: "Keep writing until you have three opening sentences",
      endpoint: "Three opening sentences written; the wording remains rough",
    };
    model.output = { pieces };
    const result = await breakDown(ctx);
    expect(result.source).toBe("ai");
    expect(result.pieces).toEqual(pieces);
    expect(model.validationMessages).toEqual([]);
  });
  it("accepts sorting followed by ordering without creating new storage", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const thing = capturedThingSchema.parse({
      what: "Sort the papers on my desk.",
      stuck: "The bills are still mixed up.",
    });
    const base = fallbackPieces(thing)[0];
    const pieces = [
      {
        ...base,
        title: "Pull two bills out of the mixed papers",
        endpoint: "Two bills separated from the other papers on the desk",
      },
      {
        ...base,
        title: "Sort those two bills by due date",
        endpoint: "Those two bills ordered by due date on the desk",
      },
      {
        ...base,
        title: "Add one more bill in due-date order",
        endpoint: "Three bills ordered by due date on the desk",
      },
    ];
    model.output = { pieces };
    const result = await breakDown({ ...ctx, thing });
    expect(result.source).toBe("ai");
    expect(result.pieces).toEqual(pieces);
  });
  it("accepts legitimate distinct writing outcomes", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const pieces = distinctWritingPieces();
    model.output = { pieces };
    const result = await breakDown(ctx);
    expect(result.source).toBe("ai");
    expect(result.pieces).toEqual(pieces);
    expect(model.validationMessages).toEqual([]);
  });
  it("rejects an invented storage location and allows the same originally named folder", async () => {
    const { breakDown } = await import("@/server/llm/interview");
    const thing = capturedThingSchema.parse({
      what: "Sort the papers on my desk",
      stuck: "The bills are still mixed up",
    });
    const base = fallbackPieces(thing)[0];
    model.output = {
      pieces: [
        {
          ...base,
          title: "Pull out just the bills from the pile",
          endpoint: "A separate stack of bills on the desk",
        },
        {
          ...base,
          title: "Group the bills by due date",
          endpoint: "Bills ordered from soonest to latest due date",
        },
        {
          ...base,
          title: "File the sorted bills into your bill folder",
          endpoint: "All bills filed in the designated folder",
        },
      ],
    };
    expect(
      (
        await breakDown({
          ...ctx,
          thing,
          originalWords: thing.what + ". " + thing.stuck,
        })
      ).source,
    ).toBe("fallback");
    expect(model.validationMessages).toContain(
      "Use only storage the person named. Keep sorted groups in that place.",
    );
    expect(
      (
        await breakDown({
          ...ctx,
          thing,
          originalWords: "Use the bill folder on the desk.",
        })
      ).source,
    ).toBe("ai");
  });
});
