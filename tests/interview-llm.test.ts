// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { capturedThingSchema } from "@/domain/week";
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
    title: "Update my CV",
  }),
  followups: 0,
  turnsLeft: 6,
};
const cvGathering = {
  message: "Which part of the CV is left?",
  phase: "gathering",
  captured: { title: "Update my CV" },
  ask: { kind: "text", allowOther: false, placeholder: "e.g. The opening" },
};
beforeEach(() => {
  model.ai = "on";
  model.fail = false;
  model.calls = [];
  model.validationMessages = [];
  model.output = cvGathering;
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
  it("routes turns to Ultra with the interview purpose", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(result.source).toBe("ai");
    expect(result.turn.captured.title).toBe("Update my CV");
    expect(model.calls.map((c) => c.options)).toMatchObject([
      {
        purpose: "interview_turn",
        model: "nvidia/Nemotron-3-Ultra-550b-a55b",
      },
    ]);
  });
  it.each([
    ["an unsafe message", { ...cvGathering, message: "We've got this" }],
    ["an em dash", { ...cvGathering, message: "Nice — when is it due?" }],
    ["a praising opener", { ...cvGathering, message: "That's a great plan." }],
    [
      "an unsafe option",
      {
        ...cvGathering,
        ask: {
          kind: "single",
          allowOther: true,
          options: [{ id: "x", label: "Take medication" }],
        },
      },
    ],
    ["an invented deadline", { ...cvGathering, captured: { when: "Friday" } }],
    [
      "a coach-word title",
      { ...cvGathering, captured: { title: "Your CV journey" } },
    ],
    [
      "a title over 60 characters",
      { ...cvGathering, captured: { title: "x".repeat(61) } },
    ],
  ])("rejects %s and uses the fixed turn", async (_, invalid) => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = invalid;
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(result.source).toBe("fallback");
    expect(result.turn.message).toBe("When does it need to be done?");
  });
  it("tells the retry what failed", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = { ...cvGathering, message: "I hear you." };
    await interviewTurn([{ role: "user", content: "Updating my CV" }], ctx);
    expect(model.validationMessages).toContain(
      "Use plain words with no AI tells, and copy what and when exactly from the person's words.",
    );
  });
  it("lets the title rephrase while what stays grounded", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...cvGathering,
      captured: { what: "my CV", title: "Finish the CV" },
    };
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(result.source).toBe("ai");
    expect(result.turn.captured).toMatchObject({
      what: "my CV",
      title: "Finish the CV",
    });
  });
  it("confirms after one follow-up and keeps the explicit deadline", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...cvGathering,
      captured: { title: "Finish the essay" },
    };
    const result = await interviewTurn(
      [
        { role: "user", content: "Finish an essay due Friday." },
        { role: "user", content: "the conclusion" },
      ],
      { ...ctx, followups: 1 },
    );
    expect(result.turn.phase).toBe("confirming");
    expect(result.turn.message).toBe(
      "Anything else you'd like to get done this week?",
    );
    expect(result.turn.captured).toMatchObject({
      title: "Finish the essay",
      when: "due Friday",
    });
  });
  it("confirms without Add another when the turn budget is nearly spent", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      { ...ctx, turnsLeft: 1, canAdd: false },
    );
    expect(result.turn.phase).toBe("confirming");
    expect(result.turn.ask?.options).toEqual([
      { id: "finish", label: "That's enough for now" },
    ]);
  });
  it("uses the fixed deadline question on provider failure, and confirms once known", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.fail = true;
    expect(
      (await interviewTurn([{ role: "user", content: "Updating my CV" }], ctx))
        .turn,
    ).toMatchObject(fallbackTurn(ctx.thing, 0));
    expect(
      (
        await interviewTurn([{ role: "user", content: "Updating my CV" }], {
          ...ctx,
          thing: { ...ctx.thing, when: "Friday" },
        })
      ).turn.phase,
    ).toBe("confirming");
  });
  it("keeps the eating-concern rule on model output", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...cvGathering,
      ask: {
        kind: "single",
        allowOther: true,
        options: [{ id: "run", label: "Go for a run" }],
      },
    };
    expect(
      (
        await interviewTurn([{ role: "user", content: "Updating my CV" }], {
          ...ctx,
          eatingConcern: true,
        })
      ).source,
    ).toBe("fallback");
  });
  it("does not call the provider with AI off and bounds prompt context", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.ai = "off";
    await interviewTurn([], ctx);
    expect(model.calls).toHaveLength(0);
    model.ai = "on";
    await interviewTurn(
      Array.from({ length: 30 }, () => ({
        role: "user" as const,
        content: "words ".repeat(400),
      })),
      {
        ...ctx,
        intake: { notes: "unused ".repeat(2000), goals: ["work_study"] },
        originalWords: "Only one shelf. " + "x".repeat(4000),
      },
    );
    expect(model.calls[0].messages).toHaveLength(13);
    const system = model.calls[0].messages[0].content;
    expect(system).not.toContain("unused");
    expect(system).toContain("Only one shelf");
    expect(
      model.calls[0].messages.reduce((n, m) => n + m.content.length, 0),
    ).toBeLessThanOrEqual(12000);
  });
  it("uses the compact interview-9 prompt with no worked example or pieces", async () => {
    const prompt = await import("@/server/llm/prompts/interview");
    const text = prompt.system({});
    expect(prompt.version).toBe("interview-9");
    expect(text).toContain("leaves out the deadline");
    expect(text).toContain("alone asks whether there is anything else");
    expect(text).not.toMatch(/\bCV\b|pieces?|break (it )?down|stuck/i);
    expect(text).toContain("captured.title");
    expect(text).not.toMatch(/Never say step, task, goal or project/);
    expect(text).toMatch(/em dashes/);
  });
  it("replaces a model question about more things with the server's turn", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...cvGathering,
      message: "Anything else you want to get done?",
    };
    const result = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      { ...ctx, canAdd: true },
    );
    expect(result.turn.phase).toBe("confirming");
    expect(result.turn.message).toBe(
      "Anything else you'd like to get done this week?",
    );
  });
  it("keeps one short placeholder and normalises e.g.,", async () => {
    const { interviewTurn } = await import("@/server/llm/interview");
    model.output = {
      ...cvGathering,
      ask: {
        kind: "text",
        allowOther: false,
        placeholder:
          "e.g., finish a work task, study for an hour, clean the kitchen",
      },
    };
    const listed = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(listed.turn.ask?.placeholder).toBe("e.g. Update my CV");
    model.output = {
      ...cvGathering,
      ask: { kind: "text", allowOther: false, placeholder: "e.g., Friday" },
    };
    const single = await interviewTurn(
      [{ role: "user", content: "Updating my CV" }],
      ctx,
    );
    expect(single.turn.ask?.placeholder).toBe("e.g. Friday");
  });
});
