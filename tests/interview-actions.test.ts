// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackTurn } from "@/domain/interview";
import { fallbackPieces } from "@/domain/piece-rules";
import type { InterviewResult } from "@/server/actions/interview";
const fixture = vi.hoisted(() => ({
  viewer: null as unknown,
  risk: "none" as string | null,
  ai: "on",
  calls: [] as unknown[],
  breakdowns: 0,
  classifiers: 0,
  breakdownContexts: [] as { originalWords?: string }[],
}));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => fixture.viewer,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/env", () => ({
  env: () => ({ ...process.env, KOE_AI: fixture.ai }),
}));
vi.mock("@/server/llm/talk", () => ({
  classifyRisk: async () => {
    fixture.classifiers++;
    return fixture.risk;
  },
}));
vi.mock("@/server/llm/interview", () => ({
  interviewTurn: async (...args: unknown[]) => {
    fixture.calls.push(args);
    const c = args[1] as {
      thing: Parameters<typeof fallbackTurn>[0];
      followups: number;
    };
    return { turn: fallbackTurn(c.thing, c.followups), source: "ai" };
  },
  breakDown: async (ctx: {
    thing: Parameters<typeof fallbackPieces>[0];
    eatingConcern: boolean;
    originalWords?: string;
  }) => {
    fixture.breakdowns++;
    fixture.breakdownContexts.push(ctx);
    return {
      pieces: fallbackPieces(ctx.thing, ctx.eatingConcern, ctx.originalWords),
      source: "ai",
    };
  },
}));
let db: Awaited<ReturnType<(typeof import("@/server/db"))["openDb"]>>;
beforeAll(async () => {
  process.env.NEBIUS_API_KEY = "test-key-never-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  db = await (await import("@/server/db")).openDb("memory:");
}, 30_000);
beforeEach(() => {
  fixture.risk = "none";
  fixture.ai = "on";
  fixture.calls = [];
  fixture.breakdowns = 0;
  fixture.classifiers = 0;
  fixture.breakdownContexts = [];
});
async function person(memoryOn = true, paused = false) {
  const schema = await import("@/server/db/schema");
  const id = crypto.randomUUID();
  await db
    .insert(schema.user)
    .values({ id, name: "Synthetic", email: `${id}@example.com` });
  await db.insert(schema.profile).values({
    userId: id,
    memoryOn,
    onboardedAt: new Date(),
    coachingPausedAt: paused ? new Date() : null,
  });
  const [profile] = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, id));
  fixture.viewer = {
    user: { id },
    profile,
    db,
    today: "2026-10-28",
    isGuest: true,
  };
  return { id, schema };
}
function token(result: InterviewResult) {
  if (!result.ok || !result.token) throw new Error(JSON.stringify(result));
  return result.token;
}
async function ready() {
  const actions = await import("@/server/actions/interview");
  const first = await actions.startInterview();
  const answer = await actions.advanceInterview({
    token: token(first),
    text: "Updating my CV",
    intent: "answer",
  });
  const proposed = await actions.advanceInterview({
    token: token(answer),
    intent: "propose",
  });
  if (!proposed.ok || !proposed.draft)
    throw new Error(JSON.stringify(proposed));
  return { actions, proposed, token: token(proposed), draft: proposed.draft };
}
describe("interview server boundary", () => {
  it("uses the matching original answers for each thing's breakdown", async () => {
    const { id } = await person();
    const r = await ready();
    fixture.breakdownContexts = [];
    const { readInterview, packInterview } =
      await import("@/server/interview-state");
    const state = readInterview(r.token, id);
    state.phase = "confirming";
    state.proposed = undefined;
    state.things = [
      state.things[0],
      { ...state.things[0], what: "Sorting your records" },
    ];
    state.words = [
      "Updating my CV. Only five minutes free at a time.",
      "Sorting your records. Only one shelf.",
    ];
    const result = await r.actions.advanceInterview({
      token: packInterview(state),
      intent: "propose",
    });
    expect(result.ok && result.draft?.items[0].pieces[0].minutes).toBe(5);
    expect(fixture.breakdownContexts.map((c) => c.originalWords)).toEqual(
      state.words,
    );
  });
  it("checks an edited approval against a time cap retained only in original answers", async () => {
    const { id } = await person();
    const r = await ready();
    const { readInterview, packInterview } =
      await import("@/server/interview-state");
    const state = readInterview(r.token, id);
    state.words[0] += "\nOnly five minutes free at a time.";
    expect(JSON.stringify(r.draft.items[0].captured)).not.toContain(
      "five minutes",
    );
    const edited = structuredClone(r.draft);
    edited.items[0].pieces[0].minutes = 10;
    const result = await r.actions.saveInterviewWeek({
      token: packInterview(state),
      draft: edited,
    });
    expect(result.ok).toBe(false);
  });
  it("keeps a renamed later proposal valid after removing the first thing", async () => {
    const { id } = await person();
    const r = await ready();
    const { readInterview, packInterview } =
      await import("@/server/interview-state");
    const state = readInterview(r.token, id);
    const first = r.draft.items[0];
    const later = {
      ...structuredClone(first),
      proposalId: crypto.randomUUID(),
      pieces: [first.pieces[0], first.pieces[0]],
    };
    state.proposed = { items: [first, later] };
    const signed = packInterview(state);
    const edited = {
      ...later,
      captured: { ...later.captured, what: "Updating your CV" },
    };
    const saved = await r.actions.saveInterviewWeek({
      token: signed,
      draft: { items: [edited] },
    });
    expect(saved.ok && saved.week?.items).toHaveLength(1);
    expect(saved.ok && saved.week?.items[0].pieces).toHaveLength(2);
    expect(saved.ok && saved.week?.items[0].captured.originalWhat).toBe(
      first.captured.what,
    );
    const forged = { ...edited, proposalId: crypto.randomUUID() };
    expect(
      (
        await r.actions.saveInterviewWeek({
          token: signed,
          draft: { items: [forged] },
        })
      ).ok,
    ).toBe(false);
  });
  it("does not persist unconfirmed words and saves only an approved draft", async () => {
    const { id, schema } = await person();
    const state = await ready();
    expect(
      await db.select().from(schema.week).where(eq(schema.week.userId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.message)
        .where(eq(schema.message.userId, id)),
    ).toHaveLength(0);
    const saved = await state.actions.saveInterviewWeek({
      token: state.token,
      draft: state.draft,
    });
    expect(saved.ok && saved.week?.items[0].captured.what).toBe(
      "Updating my CV",
    );
    const retry = await state.actions.saveInterviewWeek({
      token: state.token,
      draft: state.draft,
    });
    expect(retry.ok && retry.week?.id).toBe(saved.ok && saved.week?.id);
  });
  it("rejects foreign, forged and stale continuation tokens", async () => {
    await person();
    const actions = await import("@/server/actions/interview");
    const t = token(await actions.startInterview());
    expect(
      (await actions.advanceInterview({ token: t + "bad", text: "CV" })).ok,
    ).toBe(false);
    token(await actions.advanceInterview({ token: t, text: "CV" }));
    expect((await actions.advanceInterview({ token: t, text: "CV" })).ok).toBe(
      false,
    );
    await person();
    expect((await actions.advanceInterview({ token: t, text: "CV" })).ok).toBe(
      false,
    );
  });
  it("keeps tokens usable after a rejected operation or classifier failure", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    const t = token(await a.startInterview());
    expect((await a.advanceInterview({ token: t, intent: "propose" })).ok).toBe(
      false,
    );
    fixture.risk = null;
    const failed = await a.advanceInterview({
      token: t,
      text: "Updating my CV",
    });
    expect(failed.ok && failed.unavailable).toBe(true);
    expect(fixture.calls).toHaveLength(0);
    fixture.risk = "none";
    expect(
      (await a.advanceInterview({ token: t, text: "Updating my CV" })).ok,
    ).toBe(true);
  });
  it("never calls any model when paused, AI off or memory off", async () => {
    await person(true, true);
    const a = await import("@/server/actions/interview");
    expect((await a.startInterview()).ok).toBe(true);
    expect(fixture.classifiers).toBe(0);
    await person(false);
    await ready();
    expect(fixture.classifiers).toBe(0);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.breakdowns).toBe(0);
    fixture.ai = "off";
    await person();
    await ready();
    expect(fixture.classifiers).toBe(0);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.breakdowns).toBe(0);
  });
  it("stops risk before interviewing and pauses the person", async () => {
    const { id, schema } = await person();
    const a = await import("@/server/actions/interview");
    const t = token(await a.startInterview());
    const result = await a.advanceInterview({
      token: t,
      text: "I want to end it all",
    });
    expect(result.ok && result.safety).toBe("urgent");
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.breakdowns).toBe(0);
    expect(
      (
        await db
          .select()
          .from(schema.profile)
          .where(eq(schema.profile.userId, id))
      )[0].coachingPausedAt,
    ).not.toBeNull();
  });
  it("stops on classifier risk before any wording model call", async () => {
    const { id, schema } = await person();
    const a = await import("@/server/actions/interview");
    const t = token(await a.startInterview());
    fixture.risk = "concern";
    const result = await a.advanceInterview({
      token: t,
      text: "The weekend feels impossible",
    });
    expect(result.ok && result.safety).toBe("concern");
    expect(fixture.calls).toHaveLength(0);
    expect(
      (
        await db
          .select()
          .from(schema.safetyEvent)
          .where(eq(schema.safetyEvent.userId, id))
      )[0],
    ).toMatchObject({ source: "model", surface: "interview" });
  });
  it("enforces follow-up, thing and total-turn limits despite forged flags", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    let shown = 1;
    for (let thing = 0; thing < 3; thing++) {
      if (thing) {
        r = await a.advanceInterview({
          token: token(r),
          intent: "add",
          turns: 0,
        });
        shown++;
      }
      for (const text of [
        "Revising the opening of your CV",
        "Choosing the wording takes a long time",
        "Only the opening paragraph remains unfinished",
      ]) {
        r = await a.advanceInterview({
          token: token(r),
          text,
          phase: "gathering",
          turns: 0,
        });
        shown++;
        if (r.ok && r.turn?.phase === "confirming") break;
      }
      expect(r.ok && r.turn?.phase).toBe("confirming");
      if (shown >= 10) break;
    }
    expect(shown).toBeLessThanOrEqual(10);
    expect(
      (await a.advanceInterview({ token: token(r), intent: "add" })).ok,
    ).toBe(false);
    expect(
      (
        await a.advanceInterview({
          token: token(r),
          text: "one more answer",
          phase: "gathering",
        })
      ).ok,
    ).toBe(false);
  });
  it("rechecks edited output and server-owned eating constraints at approval", async () => {
    const { id } = await person();
    const r = await ready();
    const bad = structuredClone(r.draft);
    bad.items[0].pieces[0].title = "We should take medication";
    expect(
      (await r.actions.saveInterviewWeek({ token: r.token, draft: bad })).ok,
    ).toBe(false);
    const { saveUserModel } = await import("@/server/data/intake");
    const { intakeModel } = await import("@/domain/intake");
    await saveUserModel(
      db,
      id,
      0,
      intakeModel.parse({ eatingConcern: true }),
      "You prefer music.",
    );
    const edited = structuredClone(r.draft);
    edited.items[0].captured.what = "get fit";
    edited.items[0].pieces[0] = {
      title: "Walk outside",
      endpoint: "Stop at the gate",
      when: "Afternoon",
      sourcePhrase: "get fit",
      size: "tiny",
      minutes: 2,
    };
    expect(
      (await r.actions.saveInterviewWeek({ token: r.token, draft: edited })).ok,
    ).toBe(false);
  });
});
