// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackTurn } from "@/domain/interview";
import type { InterviewResult } from "@/server/actions/interview";
const fixture = vi.hoisted(() => ({
  viewer: null as unknown,
  risk: "none" as string | null,
  ai: "on",
  calls: [] as unknown[],
  classifiers: 0,
  title: "" as string,
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
      canAdd?: boolean;
    };
    const turn = fallbackTurn(c.thing, c.followups, c.canAdd);
    if (fixture.title) turn.captured = { title: fixture.title };
    return { turn, source: "ai" };
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
  fixture.classifiers = 0;
  fixture.title = "";
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
async function ready(text = "Updating my CV. I open it, then close it.") {
  const actions = await import("@/server/actions/interview");
  const first = await actions.startInterview();
  const answer = await actions.advanceInterview({
    token: token(first),
    text,
    intent: "answer",
  });
  const proposed = await actions.advanceInterview({
    token: token(answer),
    intent: "finish",
  });
  if (!proposed.ok || !proposed.draft)
    throw new Error(JSON.stringify(proposed));
  return { actions, proposed, token: token(proposed), draft: proposed.draft };
}
describe("interview server boundary", () => {
  it("opens with the fixed question and no info text", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    const r = await a.startInterview();
    expect(r.ok && r.turn).toMatchObject({
      message: "What's one thing you'd like to get done this week?",
      ask: { kind: "text", placeholder: "e.g. Update my CV" },
    });
    expect(r.ok && r.turn?.ask?.info).toBeUndefined();
  });
  it("finishes with a titled draft and no pieces", async () => {
    await person();
    const r = await ready();
    expect(r.draft.items).toHaveLength(1);
    expect(r.draft.items[0].captured).toEqual({
      what: "Updating my CV. I open it, then close it.",
      when: "",
      title: "Updating my CV",
    });
    expect(r.draft.items[0]).not.toHaveProperty("pieces");
  });
  it("uses a checked model title and ignores an unsafe one", async () => {
    await person();
    fixture.title = "Update my CV";
    expect((await ready()).draft.items[0].captured.title).toBe("Update my CV");
    await person();
    fixture.title = "Your CV journey";
    expect((await ready()).draft.items[0].captured.title).toBe(
      "Updating my CV",
    );
  });
  it("asks the deadline once and maps No deadline to empty", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    r = await a.advanceInterview({ token: token(r), text: "Essay" });
    expect(r.ok && r.turn?.message).toBe("When does it need to be done?");
    r = await a.advanceInterview({ token: token(r), text: "No deadline" });
    expect(r.ok && r.turn?.message).toBe(
      "Anything else you'd like to get done this week?",
    );
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.when).toBe("");
    await person();
    r = await a.startInterview();
    r = await a.advanceInterview({ token: token(r), text: "Essay" });
    r = await a.advanceInterview({ token: token(r), text: "By the weekend" });
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.when).toBe("By the weekend");
  });
  it("skips the deadline question when the first answer has one", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    r = await a.advanceInterview({
      token: token(r),
      text: "Essay due Friday",
    });
    expect(r.ok && r.turn?.phase).toBe("confirming");
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.when).toBe("due Friday");
  });
  it("treats finish with nothing named, and skip, as no week", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    const opened = await a.startInterview();
    const finished = await a.advanceInterview({
      token: token(opened),
      intent: "finish",
    });
    expect(finished.ok && finished.draft).toBeUndefined();
    const again = await a.advanceInterview({
      token: token(finished),
      text: "CV",
    });
    expect(again).toEqual({
      ok: false,
      error: "Review This week before starting again.",
    });
    const t = token(await a.startInterview());
    const named = await a.advanceInterview({ token: t, text: "CV" });
    const skipped = await a.advanceInterview({
      token: token(named),
      intent: "skip",
    });
    expect(skipped.ok && skipped.draft).toBeUndefined();
  });
  it("offers the hard-day choices, with No plan today alone before any thing", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    r = await a.advanceInterview({
      token: token(r),
      text: "I can't do anything today",
    });
    expect(r.ok && r.turn).toMatchObject({
      message: "Heavy day. Today can be really small.",
      ask: { options: [{ id: "skip", label: "No plan today" }] },
    });
    r = await a.startInterview();
    r = await a.advanceInterview({ token: token(r), text: "Essay" });
    r = await a.advanceInterview({
      token: token(r),
      text: "I'm overwhelmed",
    });
    expect(r.ok && r.turn?.ask?.options?.map((o) => o.label)).toEqual([
      "Add it to my week",
      "No plan today",
    ]);
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.title).toBe("Essay");
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
    };
    state.proposed = { items: [first, later] };
    const signed = packInterview(state);
    const edited = {
      ...later,
      captured: { ...later.captured, title: "Finish the CV", what: "forged" },
    };
    const saved = await r.actions.saveInterviewWeek({
      token: signed,
      draft: { items: [edited] },
    });
    expect(saved.ok && saved.week?.items).toHaveLength(1);
    // A rename changes only the title; the signed words stay.
    expect(saved.ok && saved.week?.items[0].captured).toEqual({
      ...first.captured,
      title: "Finish the CV",
    });
    const forged = { ...edited, proposalId: crypto.randomUUID() };
    expect(
      await r.actions.saveInterviewWeek({
        token: signed,
        draft: { items: [forged] },
      }),
    ).toEqual({ ok: false, error: "Review This week before starting again." });
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
      "Updating my CV. I open it, then close it.",
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
    expect((await a.advanceInterview({ token: t, intent: "answer" })).ok).toBe(
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
    fixture.ai = "off";
    await person();
    await ready();
    expect(fixture.classifiers).toBe(0);
    expect(fixture.calls).toHaveLength(0);
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
        if (!(r.ok && r.turn?.ask?.options?.some((o) => o.id === "add"))) break;
        r = await a.advanceInterview({
          token: token(r),
          intent: "add",
          turns: 0,
        });
        shown++;
      }
      let followups = 0;
      for (const text of [
        "Revising the opening of your CV",
        "Choosing the wording takes a long time",
        "Only the opening paragraph remains unfinished",
      ]) {
        r = await a.advanceInterview({
          token: token(r),
          text,
          phase: "gathering",
          followups: 0,
          turns: 0,
        });
        shown++;
        if (r.ok && r.turn?.phase === "confirming") break;
        followups++;
      }
      expect(followups).toBeLessThanOrEqual(1);
      expect(r.ok && r.turn?.phase).toBe("confirming");
    }
    expect(shown).toBeLessThanOrEqual(7);
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
  it("allows three things inside seven turns when deadlines are known", async () => {
    await person();
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    let shown = 1;
    for (const [i, text] of [
      "Essay due Friday",
      "Tax form due Monday",
      "Gift due Sunday",
    ].entries()) {
      if (i) {
        r = await a.advanceInterview({ token: token(r), intent: "add" });
        shown++;
      }
      r = await a.advanceInterview({ token: token(r), text });
      shown++;
    }
    expect(shown).toBe(6);
    expect(r.ok && r.turn?.ask?.options?.map((o) => o.id)).toEqual(["finish"]);
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    // Titles leave the deadline out; it stays in when.
    expect(r.ok && r.draft?.items.map((i) => i.captured.title)).toEqual([
      "Essay",
      "Tax form",
      "Gift",
    ]);
    expect(r.ok && r.draft?.items.map((i) => i.captured.when)).toEqual([
      "due Friday",
      "due Monday",
      "due Sunday",
    ]);
  });
  it("rechecks edited titles and server-owned eating constraints at approval", async () => {
    const { id } = await person();
    const r = await ready("Sorting my records");
    const bad = structuredClone(r.draft);
    bad.items[0].captured.title = "We should take medication";
    expect(
      await r.actions.saveInterviewWeek({ token: r.token, draft: bad }),
    ).toEqual({ ok: false, error: "Check the titles before saving." });
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
    edited.items[0].captured.title = "Go for a run";
    expect(
      (await r.actions.saveInterviewWeek({ token: r.token, draft: edited })).ok,
    ).toBe(false);
  });
  it("moves the title with a replaced thing and drops eating-unsafe things at finish", async () => {
    const a = await import("@/server/actions/interview");
    const eating = (await import("@/domain/intake")).intakeModel.parse({
      eatingConcern: true,
    });
    await person();
    let r = await a.startInterview({ intake: eating });
    r = await a.advanceInterview({ token: token(r), text: "Get fit." });
    r = await a.advanceInterview({
      token: token(r),
      text: "Sorting my music playlist instead.",
    });
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured).toMatchObject({
      what: "Sorting my music playlist",
      title: "Sorting my music playlist",
    });
    await person();
    fixture.title = "Sort my playlist";
    r = await a.startInterview({ intake: eating });
    r = await a.advanceInterview({ token: token(r), text: "Get fit." });
    r = await a.advanceInterview({
      token: token(r),
      text: "Sorting my music playlist instead.",
    });
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.title).toBe("Sort my playlist");
    await person();
    fixture.title = "";
    r = await a.startInterview({ intake: eating });
    r = await a.advanceInterview({ token: token(r), text: "Get fit." });
    r = await a.advanceInterview({ token: token(r), text: "This week" });
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    // Nothing safe is left, so it ends like skipping.
    expect(r).toMatchObject({ ok: true, turn: null });
    expect(r.ok && r.draft).toBeUndefined();
  });
  it("upper-cases a lower-case model title and strips its deadline", async () => {
    await person();
    fixture.title = "finish my essay by Friday";
    const a = await import("@/server/actions/interview");
    let r = await a.startInterview();
    r = await a.advanceInterview({ token: token(r), text: "Essay due Friday" });
    r = await a.advanceInterview({ token: token(r), intent: "finish" });
    expect(r.ok && r.draft?.items[0].captured.title).toBe("Finish my essay");
  });
});
