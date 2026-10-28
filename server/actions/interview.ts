"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emptyModel, freeTexts, intakeModel } from "@/domain/intake";
import {
  confirmingTurn,
  fallbackTurn,
  HARD_DAY,
  hardDayTurn,
  literalInterviewCapture,
  MAX_THINGS,
  MAX_TURNS,
  NO_DEADLINE,
  openingTurn,
  WHEN_QUESTION,
  whenFromAnswer,
  looksLikeWhen,
  type InterviewReply,
} from "@/domain/interview";
import { eatingSafe, safeInterviewText } from "@/domain/interview-text";
import {
  capturedThingSchema,
  fallbackTitle,
  tidyTitle,
  type WeekDraft,
  type WeekView,
} from "@/domain/week";
import { detectEatingConcern } from "@/domain/plan-menu";
import type { RiskLevel } from "@/domain/safety";
import { getUserModel } from "../data/intake";
import { getWeek, saveWeek } from "../data/week";
import { interviewTurn, type InterviewContext } from "../llm/interview";
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
    /^(Open the interview again|This interview changed|Open this week again|This week changed|Your week already has|Review This week before|Give it a few words\.|Name something for this week|Choose something without|Review these things|Check the titles before saving)/.test(
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
    turnsLeft: MAX_TURNS - state.turns,
    canAdd: canAdd(state),
  };
}
/** Adding needs room for its opening and confirming turns. */
function canAdd(state: InterviewState) {
  return (
    state.things.length + state.existingCount < MAX_THINGS &&
    state.turns + 2 <= MAX_TURNS
  );
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
    if ((existing?.items.length ?? 0) >= MAX_THINGS)
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
        intent: z.enum(["answer", "add", "finish", "skip"]).default("answer"),
      })
      .parse(raw);
    const state = readInterview(input.token, v.user.id);
    if (state.phase === "done")
      throw new Error("Review This week before starting again.");
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
    // A pending "Add another" marker has no words yet and is never saved.
    const named = state.things.filter((_, i) => !!state.words[i]);
    if (
      input.intent === "skip" ||
      (input.intent === "finish" && !named.length)
    ) {
      state.phase = "done";
      return { ok: true, safety: "none", turn: null, token: nextToken() };
    }
    const eatingConcern = !!state.intake.eatingConcern;
    // A thing that fails the eating rule or the title check is left out.
    const kept = named.filter(
      (t) =>
        safeInterviewText(t.title, eatingConcern) &&
        (!eatingConcern || eatingSafe(t.what)),
    );
    if (input.intent === "finish" && !kept.length) {
      state.phase = "done";
      return { ok: true, safety: "none", turn: null, token: nextToken() };
    }
    if (input.intent === "finish") {
      state.proposed = {
        items: kept.map((captured) => ({
          proposalId: crypto.randomUUID(),
          captured,
        })),
      };
      state.phase = "done";
      return {
        ok: true,
        safety: "none",
        turn: null,
        token: nextToken(),
        draft: state.proposed,
      };
    }
    let turn: InterviewReply;
    let source: "ai" | "fallback" = "fallback";
    if (input.intent === "add") {
      if (!state.things.length || !state.words.at(-1) || !canAdd(state))
        throw new Error("Review these things before adding another.");
      state.followups = 0;
      state.phase = "gathering";
      // Empty marker only in encrypted continuation state, never persisted.
      state.things.push(
        capturedThingSchema.parse({ what: "Pending", title: "Pending" }),
      );
      state.words.push("");
      turn = openingTurn();
    } else {
      const text = input.text!;
      const eatingConcern = (state.intake.eatingConcern ||=
        detectEatingConcern(text));
      const isFirst = !state.things.length || !state.words.at(-1);
      const hardDay = HARD_DAY.test(text);
      // A replacement ("… instead") answers what, not the deadline question.
      const askedWhen =
        !isFirst &&
        !hardDay &&
        !!state.askedWhen &&
        !/\binstead[.!?]?$/i.test(text);
      const previousWhat = isFirst ? "" : (state.things.at(-1)?.what ?? "");
      if (isFirst && !hardDay) {
        const thing = capturedThingSchema.parse({
          what: text,
          title: fallbackTitle(text),
        });
        if (!state.things.length) {
          state.things.push(thing);
          state.words.push(text);
        } else {
          state.things[state.things.length - 1] = thing;
          state.words[state.words.length - 1] = text;
        }
      } else if (!isFirst) {
        if (state.phase !== "gathering")
          throw new Error("Review these things before adding another.");
        state.followups = 1;
        state.words[state.words.length - 1] += "\n" + text;
      }
      state.history.push({ role: "user", content: text });
      const thing = state.things.at(-1);
      const words = state.words.at(-1) ?? "";
      const hasThing = !!thing && !!words;
      const ai = v.profile.memoryOn && env().KOE_AI === "on";
      if (hasThing) {
        Object.assign(thing, literalInterviewCapture(words, eatingConcern));
        if (askedWhen) thing.when = whenFromAnswer(text);
      }
      if (hardDay) turn = hardDayTurn(state.words.some(Boolean));
      else if (
        state.followups >= 1 ||
        !!thing?.when ||
        state.turns + 2 > MAX_TURNS
      ) {
        turn = confirmingTurn(canAdd(state));
        // The model still tidies the title and what from the latest answer.
        if (ai && !askedWhen) {
          const reply = await interviewTurn(
            state.history,
            context(state),
            v.user.id,
          );
          turn = { ...turn, captured: reply.turn.captured };
          source = reply.source;
        }
      } else if (ai) {
        const reply = await interviewTurn(
          state.history,
          context(state),
          v.user.id,
        );
        turn = reply.turn;
        source = reply.source;
      } else turn = fallbackTurn(thing!, state.followups, canAdd(state));
      if (hasThing) {
        for (const key of ["what", "when"] as const) {
          const value = turn.captured[key];
          if (value && words.includes(value)) thing[key] = value;
        }
        Object.assign(thing, literalInterviewCapture(words, eatingConcern));
        if (askedWhen) thing.when = whenFromAnswer(text);
        if (thing.when === NO_DEADLINE || !looksLikeWhen(thing.when))
          thing.when = "";
        const title = tidyTitle(turn.captured.title ?? "", thing.when);
        if (
          title &&
          title.length <= 60 &&
          safeInterviewText(title, eatingConcern)
        )
          thing.title = title;
        // Never keep a title from words the person replaced.
        else if (thing.what !== previousWhat)
          thing.title =
            tidyTitle(fallbackTitle(thing.what), thing.when) ||
            fallbackTitle(thing.what);
        else thing.title = tidyTitle(thing.title, thing.when) || thing.title;
      }
      if (turn.phase === "done") turn = confirmingTurn(canAdd(state));
      state.phase = turn.phase;
    }
    state.turns = Math.min(state.turns + 1, MAX_TURNS);
    state.askedWhen = turn.message === WHEN_QUESTION;
    if (!canAdd(state) && turn.ask?.options)
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
