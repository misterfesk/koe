"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emptyModel, freeTexts, intakeModel } from "@/domain/intake";
import {
  confirmingTurn,
  hardDayTurn,
  literalInterviewCapture,
  openingTurn,
  type InterviewReply,
} from "@/domain/interview";
import {
  capturedThingSchema,
  type WeekDraft,
  type WeekView,
} from "@/domain/week";
import { detectEatingConcern } from "@/domain/plan-menu";
import type { RiskLevel } from "@/domain/safety";
import { getUserModel } from "../data/intake";
import { getWeek, saveWeek } from "../data/week";
import {
  interviewTurn,
  breakDown,
  type InterviewContext,
} from "../llm/interview";
import {
  consumeInterviewApproval,
  interviewSafety,
  packInterview,
  readInterview,
  type InterviewState,
} from "../interview-state";
import { requireViewer } from "../viewer";
import { env } from "../env";

export type InterviewResult =
  | {
      ok: true;
      safety: RiskLevel;
      token?: string;
      turn: InterviewReply | null;
      draft?: WeekDraft;
      week?: WeekView;
      unavailable?: boolean;
      paused?: boolean;
      source?: "ai" | "fallback";
    }
  | { ok: false; error: string };
const failed = (error: unknown): InterviewResult => ({
  ok: false,
  error:
    error instanceof Error &&
    /^(Open the interview again|This interview changed|Open this week again|This week changed|Your week already has|Review your pieces|Give it a few words\.|Name something for this week|Choose something without|Review these things|Choose whether to break|Keep the proposed pieces|Check the words and sizes)/.test(
      error.message,
    )
      ? error.message
      : "Check your words and try again.",
});
function context(state: InterviewState): InterviewContext {
  const thing = state.things.at(-1)!;
  return {
    intake: {
      goals: state.intake.goals,
      days: state.intake.days,
      wake: state.intake.wake,
      lifts: state.intake.lifts,
      eatingConcern: state.intake.eatingConcern,
    },
    eatingConcern: !!state.intake.eatingConcern,
    caring: state.intake.days === "caring",
    thing,
    originalWords: state.words.at(-1) ?? "",
    followups: state.followups,
    turnsLeft: 10 - state.turns,
  };
}
export async function startInterview(
  raw: unknown = {},
): Promise<InterviewResult> {
  const v = await requireViewer();
  if (v.profile.coachingPausedAt)
    return { ok: true, safety: "concern", paused: true, turn: null };
  try {
    const input = z
      .object({
        intake: intakeModel.optional(),
        weekId: z.string().max(64).optional(),
        expectedVersion: z.number().int().positive().optional(),
      })
      .parse(raw);
    const existing = input.weekId
      ? await getWeek(v.db, v.user.id, input.weekId)
      : null;
    if (
      input.weekId &&
      (!existing || existing.version !== input.expectedVersion)
    )
      throw new Error(
        "This week changed. Open it again before adding something.",
      );
    if ((existing?.items.length ?? 0) >= 3)
      throw new Error(
        "Your week already has three things. Review it before adding more.",
      );
    const saved = await getUserModel(v.db, v.user.id);
    const intake =
      input.intake ??
      (v.profile.memoryOn ? saved?.model : undefined) ??
      emptyModel();
    intake.eatingConcern ||= !!saved?.model.eatingConcern;
    const gate = await interviewSafety(v, freeTexts(intake));
    if (gate.safety !== "none" || gate.unavailable)
      return { ok: true, ...gate, turn: null };
    intake.eatingConcern ||= freeTexts(intake).some(detectEatingConcern);
    const turn = openingTurn();
    const state: InterviewState = {
      id: crypto.randomUUID(),
      userId: v.user.id,
      expires: Date.now() + 7 * 86400_000,
      sequence: 0,
      turns: 1,
      phase: "gathering",
      intake,
      things: [],
      words: [],
      followups: 0,
      history: [{ role: "assistant", content: turn.message }],
      weekId: input.weekId,
      expectedVersion: input.expectedVersion,
      existingCount: existing?.items.length ?? 0,
    };
    return { ok: true, safety: "none", turn, token: packInterview(state) };
  } catch (error) {
    return failed(error);
  }
}
export async function advanceInterview(raw: unknown): Promise<InterviewResult> {
  const v = await requireViewer();
  if (v.profile.coachingPausedAt)
    return { ok: true, safety: "concern", paused: true, turn: null };
  try {
    const input = z
      .object({
        token: z.string().max(100_000),
        text: z.string().trim().max(400).optional(),
        intent: z
          .enum(["answer", "add", "propose", "finish"])
          .default("answer"),
      })
      .parse(raw);
    const state = readInterview(input.token, v.user.id);
    if (state.phase === "done")
      throw new Error("Review your pieces before starting another interview.");
    if (input.intent === "answer" && !input.text)
      throw new Error("Give it a few words.");
    const gate = await interviewSafety(
      v,
      input.text ? [...state.words, input.text] : [],
    );
    if (gate.safety !== "none" || gate.unavailable)
      return { ok: true, ...gate, turn: null };
    const nextToken = () => {
      readInterview(input.token, v.user.id);
      state.sequence++;
      return packInterview(state);
    };
    if (input.intent === "finish") {
      state.phase = "done";
      return { ok: true, safety: "none", turn: null, token: nextToken() };
    }
    if (input.intent === "propose") {
      if (!state.things.length || !state.words.at(-1))
        throw new Error("Name something for this week first.");
      const items: WeekDraft["items"] = [];
      let source: "ai" | "fallback" = "ai";
      for (const [index, thing] of state.things.entries()) {
        const ctx = {
          ...context(state),
          thing,
          originalWords: state.words[index] ?? "",
        };
        // memory off is fully local, including fresh words and the safety classifier.
        const result =
          v.profile.memoryOn && env().KOE_AI === "on"
            ? await breakDown(ctx, v.user.id)
            : {
                pieces: (await import("@/domain/piece-rules")).fallbackPieces(
                  thing,
                  ctx.eatingConcern,
                  ctx.originalWords,
                ),
                source: "fallback" as const,
              };
        if (!result.pieces.length)
          throw new Error(
            "Choose something without food, exercise, medical or harmful instructions.",
          );
        items.push({
          proposalId: crypto.randomUUID(),
          captured: thing,
          pieces: result.pieces,
        });
        if (result.source === "fallback") source = "fallback";
      }
      state.proposed = { items };
      state.phase = "done";
      return {
        ok: true,
        safety: "none",
        turn: null,
        token: nextToken(),
        draft: state.proposed,
        source,
      };
    }
    let turn: InterviewReply;
    let source: "ai" | "fallback" = "fallback";
    if (input.intent === "add") {
      if (
        !state.things.length ||
        !state.words.at(-1) ||
        state.things.length + state.existingCount >= 3 ||
        state.turns >= 9
      )
        throw new Error("Review these things before adding another.");
      state.followups = 0;
      state.phase = "gathering";
      // Empty marker only in encrypted continuation state, never persisted.
      state.things.push(capturedThingSchema.parse({ what: "Pending" }));
      state.words.push("");
      turn = openingTurn();
    } else {
      const text = input.text!;
      state.intake.eatingConcern ||= detectEatingConcern(text);
      const isFirst = !state.things.length || !state.words.at(-1);
      if (isFirst) {
        const thing = capturedThingSchema.parse({ what: text });
        if (!state.things.length) {
          state.things.push(thing);
          state.words.push(text);
        } else {
          state.things[state.things.length - 1] = thing;
          state.words[state.words.length - 1] = text;
        }
      } else {
        if (state.phase !== "gathering")
          throw new Error(
            "Choose whether to break this down or add something.",
          );
        state.followups++;
        state.words[state.words.length - 1] += "\n" + text;
        const thing = state.things.at(-1)!;
        if (state.followups === 1) thing.stuck = text;
        else thing.left = text;
      }
      state.history.push({ role: "user", content: text });
      const early =
        state.history
          .filter((m) => m.role === "user")
          .slice(-2)
          .every((m) => m.content.split(/\s+/).length <= 4) &&
        state.followups >= 1;
      if (/can['’]?t do anything|overwhelm/i.test(text))
        turn = hardDayTurn(state.things.at(-1)!, !!state.intake.eatingConcern);
      else if (v.profile.memoryOn && env().KOE_AI === "on") {
        const reply = await interviewTurn(
          state.history,
          context(state),
          v.user.id,
        );
        turn = reply.turn;
        if (turn.phase === "confirming")
          turn = { ...confirmingTurn(), captured: turn.captured };
        source = reply.source;
        for (const [key, value] of Object.entries(turn.captured))
          if (value && state.words.at(-1)!.includes(value))
            state.things.at(-1)![key as keyof typeof turn.captured] = value;
        // Capture the final answer before closing the gathering phase.
        if (state.followups >= 2 || state.turns >= 9 || early)
          turn = { ...confirmingTurn(), captured: turn.captured };
      } else
        turn = (await import("@/domain/interview")).fallbackTurn(
          state.things.at(-1)!,
          state.followups,
        );
      if (turn.phase === "done")
        turn = { ...confirmingTurn(), captured: turn.captured };
      Object.assign(
        state.things.at(-1)!,
        literalInterviewCapture(
          state.words.at(-1) ?? "",
          !!state.intake.eatingConcern,
        ),
      );
      state.phase = turn.phase;
    }
    state.turns++;
    if (state.turns >= 10) {
      turn = confirmingTurn();
      state.phase = "confirming";
    }
    if (state.things.length + state.existingCount >= 3 && turn.ask?.options)
      turn.ask.options = turn.ask.options.filter((o) => o.id !== "add");
    state.history.push({ role: "assistant", content: turn.message });
    state.history = state.history.slice(-20);
    return { ok: true, safety: "none", turn, token: nextToken(), source };
  } catch (error) {
    return failed(error);
  }
}
export async function saveInterviewWeek(
  raw: unknown,
): Promise<InterviewResult> {
  const v = await requireViewer();
  if (v.profile.coachingPausedAt)
    return { ok: true, safety: "concern", paused: true, turn: null };
  try {
    const input = z
      .object({ token: z.string().max(100_000), draft: z.unknown() })
      .parse(raw);
    const result = await consumeInterviewApproval(v, input.token, input.draft);
    if (!result.approval)
      return {
        ok: true,
        safety: result.safety,
        unavailable: result.unavailable,
        turn: null,
      };
    const week = await saveWeek(v.db, v.user.id, result.approval);
    revalidatePath("/", "layout");
    return { ok: true, safety: "none", turn: null, week };
  } catch (error) {
    return failed(error);
  }
}
