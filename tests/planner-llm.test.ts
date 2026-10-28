// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { diffPlans } from "@/domain/day-plan";
import { intakeModel } from "@/domain/intake";
import {
  checkComposition,
  contextFor,
  fallbackPlan,
  guardrailHits,
  isMenuExample,
  menuPromptText,
} from "@/domain/plan-menu";

// A plain function, not vi.fn(): see intake-llm.test.ts.
type Call = [{ content: string }[], unknown, Record<string, unknown>];
const fake = vi.hoisted(() => ({
  impl: (async () => ({})) as (...args: Call) => Promise<unknown>,
  calls: [] as Call[],
}));
vi.mock("@/server/llm/nebius", () => ({
  completeJson: (...args: Call) => {
    fake.calls.push(args);
    return fake.impl(...args);
  },
  AiUnavailable: class AiUnavailable extends Error {},
}));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.KOE_AI = "on";
});
beforeEach(() => {
  fake.calls = [];
  fake.impl = async () => ({});
});

const TODAY = "2026-10-27";
const model = intakeModel.parse({
  goals: ["work_study", "energy"],
  wake: "7to9",
  days: "working",
  lifts: ["music"],
  people: ["friend"],
  names: [{ name: "Sam", save: false }],
});

async function setup(day = TODAY) {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  await db
    .insert(schema.user)
    .values({ id: "a", name: "a", email: "a@x.test" });
  await db
    .insert(schema.profile)
    .values({ userId: "a", timezone: "UTC", onboardedAt: new Date() });
  const { commitIntro, getPlanDay } = await import("@/server/data/intake");
  await commitIntro(db, "a", {
    model,
    summary: "You want more energy.",
    memories: [],
    people: [],
    items: fallbackPlan(model),
    memoryOn: true,
    today: day,
  });
  return { db, plan: (await getPlanDay(db, "a", day))! };
}

/** The model's reply for the current plan with the given edits, as it would write it. */
function reply(
  plan: Awaited<ReturnType<typeof setup>>["plan"],
  edit: (
    item: ReturnType<typeof asReply>,
    i: number,
  ) => ReturnType<typeof asReply>,
  note = "Lighter day: swapped the longer ones for shorter ones.",
) {
  return { note, items: plan.items.map(asReply).map(edit) };
}
function asReply(i: {
  stepId?: string;
  kind: string;
  title: string;
  why: string;
  size: string;
  minuteOfDay: number;
}) {
  return {
    keepId: i.stepId ?? null,
    kind: i.kind,
    title: i.title,
    why: i.why,
    size: i.size,
    minuteOfDay: i.minuteOfDay,
  };
}

const run = async (low = true) => {
  const { planToday } = await import("@/server/llm/planner");
  return planToday(
    "a",
    { reason: "check_in", energy: low ? "low" : "more", word: "tired" },
    { db: (await ctx()).db, today: TODAY },
  );
};
let current: Awaited<ReturnType<typeof setup>>;
const ctx = async () => current;

describe("the planner with a model", { timeout: 60_000 }, () => {
  it("uses a good reply, once, on the planner purpose with the big model", async () => {
    current = await setup();
    const { plan } = current;
    const longer = plan.items.find((i) => i.size === "small")!;
    const note = `Lighter day: swapped "${longer.title}" for "Open the document you need for work".`;
    fake.impl = async () =>
      reply(
        plan,
        (i) =>
          i.size === "small"
            ? {
                ...i,
                keepId: null,
                size: "tiny",
                title: "Open the document you need for work",
              }
            : i,
        note,
      );
    const r = await run();
    expect(r.source).toBe("ai");
    expect(r.changed).toBe(true);
    expect(r.replaced).toBe(0);
    expect(r.note).toBe(note);
    expect(fake.calls).toHaveLength(1);
    const [messages, , options] = fake.calls[0];
    expect(options).toMatchObject({ purpose: "planner", userId: "a" });
    expect(options.model).toBeUndefined();
    const system = messages[0].content;
    expect(system).toContain("TITLES");
    expect(system).toContain("NEVER SUGGEST");
    // The prompt holds no menu example sentences for the model to copy.
    expect(system).not.toContain("Drink a glass of water");
    expect(menuPromptText()).not.toMatch(/Put on one song/);
    const user = JSON.parse(messages[1].content);
    expect(user).toMatchObject({
      reason: "check_in",
      energy: "low",
      arrivedWith: "tired",
    });
    expect(user.plan).toHaveLength(3);
    expect(user.plan[0].id).toBeTruthy();
  });

  it("replaces only the items that break a rule when the reply is bad", async () => {
    current = await setup();
    const { plan } = current;
    fake.impl = async () =>
      reply(
        plan,
        (i, n) =>
          n === 0
            ? {
                ...i,
                keepId: null,
                size: "tiny",
                title: "Burn off breakfast with a quick run",
              }
            : n === 1
              ? {
                  ...i,
                  keepId: null,
                  size: "tiny",
                  title: "Open the document for ten minutes",
                }
              : i,
        "We made your day lighter together.",
      );
    const r = await run();
    expect(r.source).toBe("ai");
    expect(r.replaced).toBeGreaterThanOrEqual(1);
    // The note failed the voice check, so Koe's own wording stands in.
    expect(r.note).not.toMatch(/\b(we|us|together)\b/i);
    expect(r.note).toMatch(/^Lighter day: /);
    const { getPlanDay } = await import("@/server/data/intake");
    const after = (await getPlanDay(current.db, "a", TODAY))!;
    expect(after.items.some((i) => /burn|breakfast/i.test(i.title))).toBe(
      false,
    );
    for (const i of after.items) {
      expect(guardrailHits(i.title + " " + i.why)).toEqual([]);
      expect(i.size).toBe("tiny");
    }
    expect(
      checkComposition(after.items, {
        ...contextFor(model, true),
        lighter: true,
      }),
    ).toEqual([]);
  });

  it("puts back an item the model made bigger on a low day", async () => {
    current = await setup();
    const { plan } = current;
    fake.impl = async () =>
      reply(plan, (i) => ({
        ...i,
        keepId: null,
        size: "medium",
        title: i.title + " for longer",
      }));
    const r = await run();
    expect(r.changed).toBe(true);
    const { getPlanDay } = await import("@/server/data/intake");
    const after = (await getPlanDay(current.db, "a", TODAY))!;
    for (const i of after.items) expect(i.size).not.toBe("medium");
    const d = diffPlans(plan.items, after.items);
    expect(d.grown).toHaveLength(0);
  });

  it("falls back to the rules when the model fails or is invalid", async () => {
    current = await setup();
    fake.impl = async () => {
      throw new Error("provider down");
    };
    const r = await run();
    expect(r.source).toBe("rules");
    expect(r.changed).toBe(true);
    expect(r.note).toMatch(/^Lighter day: Made ".*" smaller: "/);
  });

  it("makes one item smaller with the fast model, and falls back when it breaks a rule", async () => {
    current = await setup();
    const { plan } = current;
    const item = plan.items.find((i) => i.size === "small")!;
    fake.impl = async () => ({
      note: "Swapped it for a shorter one.",
      kind: item.kind,
      title: "Open the document you need for work",
      why: "Because you said work would help most",
      size: "tiny",
    });
    const { planToday } = await import("@/server/llm/planner");
    const r = await planToday(
      "a",
      { reason: "not_today_shrink", itemId: item.stepId },
      { db: current.db, today: TODAY },
    );
    expect(r.source).toBe("ai");
    expect(r.changed).toBe(true);
    expect(fake.calls[0][2].model).toBe(
      "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    );

    // A "smaller" version that is not smaller is refused.
    current = await setup();
    const again = current.plan.items.find((i) => i.size === "small")!;
    fake.impl = async () => ({
      note: "Swapped it.",
      kind: again.kind,
      title: "Spend twenty minutes on a bigger job",
      why: "Because you said work would help most",
      size: "small",
    });
    const r2 = await planToday(
      "a",
      { reason: "not_today_shrink", itemId: again.stepId },
      { db: current.db, today: TODAY },
    );
    expect(r2.source).toBe("rules");
    expect(r2.changed).toBe(true);
  });

  it("falls back to the template note when the model's note uses jargon", async () => {
    current = await setup();
    const { plan } = current;
    fake.impl = async () =>
      reply(
        plan,
        (i) =>
          i.size === "small"
            ? {
                ...i,
                keepId: null,
                size: "tiny",
                title: "Open the document you need for work",
              }
            : i,
        "Lighter day: dropped the landlord email and guitar; kept the basics anchor as a tiny step.",
      );
    const r = await run();
    expect(r.changed).toBe(true);
    expect(r.note).toMatch(/^Lighter day: /);
    expect(r.note).not.toMatch(/step|anchor|basics/i);
    expect(r.note).toContain("Open the document you need for work");
  });

  it("with memory off, the planner sends kind, size and time only, never titles or why lines", async () => {
    current = await setup();
    const { db, plan } = current;
    const { profile } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(profile)
      .set({ memoryOn: false })
      .where(eq(profile.userId, "a"));
    fake.impl = async () =>
      reply(plan, (i) =>
        i.size === "small"
          ? {
              ...i,
              keepId: null,
              size: "tiny",
              title: "Open the document you need for work",
            }
          : i,
      );
    await run();
    const sent = fake.calls[0][0][1].content;
    for (const i of plan.items) {
      expect(sent).not.toContain(i.title);
      expect(sent).not.toContain(i.why);
    }
    const user = JSON.parse(sent);
    expect(user.plan).toHaveLength(3);
    for (const p of user.plan) {
      expect(Object.keys(p).sort()).toEqual([
        "id",
        "kind",
        "minuteOfDay",
        "size",
        "state",
      ]);
    }
    expect(user.about).toBeUndefined();
    expect(user.summary).toBeUndefined();

    // A swap or a shrink of one item sends no titles either.
    fake.calls = [];
    const { planToday } = await import("@/server/llm/planner");
    fake.impl = async () => ({
      note: "Swapped.",
      kind: plan.items[0].kind,
      title: "Open the window for a minute",
      why: "Because you want a small start",
      size: "tiny",
    });
    await planToday(
      "a",
      { reason: "not_today_swap", itemId: plan.items[0].stepId },
      { db, today: TODAY },
    );
    const one = fake.calls[0][0][1].content;
    for (const i of plan.items) {
      expect(one).not.toContain(i.title);
      expect(one).not.toContain(i.why);
    }
  });

  it("with memory on, the same input does carry the titles", async () => {
    current = await setup();
    const { plan } = current;
    fake.impl = async () => reply(plan, (i) => i);
    await run();
    expect(fake.calls[0][0][1].content).toContain(plan.items[0].title);
  });

  it("plans a later day with the model and checks it like the first", async () => {
    // Yesterday's plan exists, so today is not the first day.
    current = await setup("2026-10-26");
    const { openToday } = await import("@/server/llm/planner");
    fake.impl = async () => ({
      note: "Today starts small.",
      items: [
        {
          keepId: null,
          kind: "basics",
          title: "Wash your face and open the curtains",
          why: "Because you said energy would help most",
          size: "tiny",
          minuteOfDay: 8 * 60,
        },
        {
          keepId: null,
          kind: "work_chunk",
          title: "Open the report you need for work",
          why: "Because you said work would help most",
          size: "small",
          minuteOfDay: 13 * 60,
        },
        {
          keepId: null,
          kind: "enjoy",
          title: "Play one record you used to like",
          why: "Because you said music used to lift you",
          size: "tiny",
          minuteOfDay: 19 * 60,
        },
      ],
    });
    const plan = await openToday("a", { db: current.db, today: TODAY });
    expect(plan.version).toBe(1);
    expect(plan.items.map((i) => i.title)).toContain(
      "Open the report you need for work",
    );
    expect(fake.calls).toHaveLength(1);
    expect(isMenuExample(plan.items[0].title)).toBe(false);
  });

  it("a model-made plan on day 2 is a draft: Keep it stores the choice, Start simpler is versioned and can be undone", async () => {
    current = await setup("2026-10-26");
    const { openToday, planToday } = await import("@/server/llm/planner");
    const { keepDraft, undoLastChange } = await import("@/server/data/plan");
    const { getPlanDay } = await import("@/server/data/intake");
    const dayPlan = {
      note: "Today starts small.",
      items: [
        {
          keepId: null,
          kind: "basics",
          title: "Wash your face and open the curtains",
          why: "Because you said energy would help most",
          size: "tiny",
          minuteOfDay: 8 * 60,
        },
        {
          keepId: null,
          kind: "work_chunk",
          title: "Open the report you need for work",
          why: "Because you said work would help most",
          size: "small",
          minuteOfDay: 13 * 60,
        },
        {
          keepId: null,
          kind: "enjoy",
          title: "Play one record you used to like",
          why: "Because you said music used to lift you",
          size: "tiny",
          minuteOfDay: 19 * 60,
        },
      ],
    };
    fake.impl = async () => dayPlan;
    const plan = await openToday("a", { db: current.db, today: TODAY });
    expect(plan.version).toBe(1);
    expect(plan.reason).toBe("draft");

    // Start simpler: the lighter-day action writes version 2 ...
    fake.impl = async () => ({ note: "x", items: [] });
    const simpler = await planToday(
      "a",
      { reason: "lighter" },
      { db: current.db, today: TODAY },
    );
    expect(simpler.changed).toBe(true);
    expect(simpler.version).toBe(2);
    expect((await getPlanDay(current.db, "a", TODAY))!.mode).toBe("lighter");
    // ... and undo brings the draft back, still a draft.
    expect((await undoLastChange(current.db, "a", TODAY)).ok).toBe(true);
    const back = (await getPlanDay(current.db, "a", TODAY))!;
    expect(back.version).toBe(1);
    expect(back.reason).toBe("draft");

    // Keep it: stored, so the banner stays away after a reload.
    expect((await keepDraft(current.db, "a", TODAY)).ok).toBe(true);
    expect((await getPlanDay(current.db, "a", TODAY))!.reason).toBe(
      "draft_kept",
    );
    expect((await keepDraft(current.db, "a", TODAY)).ok).toBe(false);
  });

  it("day 1 and a rules-made day 2 are not drafts", async () => {
    current = await setup("2026-10-26");
    const { openToday } = await import("@/server/llm/planner");
    const { getPlanDay } = await import("@/server/data/intake");
    // Day 1 (the intro) is written as "intro".
    expect((await getPlanDay(current.db, "a", "2026-10-26"))!.reason).toBe(
      "intro",
    );
    // The model fails, so the rules make day 2.
    fake.impl = async () => {
      throw new Error("down");
    };
    const plan = await openToday("a", { db: current.db, today: TODAY });
    expect(plan.reason).toBe("first_open");
  });
});

describe("the planner with This week things", { timeout: 60_000 }, () => {
  async function withWeek() {
    const s = await setup("2026-10-26");
    const { saveWeek } = await import("@/server/data/week");
    const week = await saveWeek(s.db, "a", {
      draft: {
        items: [
          {
            captured: {
              what: "Update my CV. I open it, then close it again.",
              when: "Friday",
              title: "Update my CV",
            },
          },
          {
            captured: {
              what: "Email the landlord about the boiler",
              when: "",
              title: "Email the landlord",
            },
          },
          {
            captured: {
              what: "Sort the pile of letters on the table",
              when: "",
              title: "Sort the letters",
            },
          },
        ],
      },
      today: "2026-10-26",
      eatingConcern: false,
    });
    return { ...s, week };
  }

  it("builds the day from the things plus one anchor, with no AI call", async () => {
    const { db, week } = await withWeek();
    const { openToday } = await import("@/server/llm/planner");
    const plan = await openToday("a", { db, today: TODAY });
    expect(fake.calls).toHaveLength(0);
    expect(plan.reason).toBe("draft");
    const things = plan.items.filter((i) => i.weekItemId);
    expect(things.map((i) => i.title)).toEqual([
      "Update my CV",
      "Email the landlord",
    ]);
    expect(things[0].why).toBe(
      'Because you said "Update my CV. I open it, then close it again."',
    );
    expect(plan.items.filter((i) => !i.weekItemId)).toHaveLength(1);
    // The link is stored on the step.
    const schema = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ w: schema.step.weekItemId })
      .from(schema.step)
      .where(eq(schema.step.id, things[0].stepId!));
    expect(row.w).toBe(week.items[0].id);
  });

  it("re-picks on a low check-in and never shrinks or swaps a thing", async () => {
    const { db } = await withWeek();
    const { openToday, planToday } = await import("@/server/llm/planner");
    await openToday("a", { db, today: TODAY });
    const low = await planToday(
      "a",
      { reason: "check_in", energy: "low" },
      { db, today: TODAY },
    );
    expect(low.changed).toBe(true);
    expect(fake.calls).toHaveLength(0);
    const { getPlanDay } = await import("@/server/data/intake");
    const plan = (await getPlanDay(db, "a", TODAY))!;
    expect(plan.items.filter((i) => i.weekItemId)).toHaveLength(1);
    expect(plan.items.filter((i) => !i.weekItemId)).toHaveLength(1);
    const thing = plan.items.find((i) => i.weekItemId)!;
    const shrink = await planToday(
      "a",
      { reason: "not_today_shrink", itemId: thing.stepId },
      { db, today: TODAY },
    );
    expect(shrink.changed).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it("derives Done, Partly and Not today; done things leave the pool", async () => {
    const { db, week } = await withWeek();
    const { openToday } = await import("@/server/llm/planner");
    const { reportStep } = await import("@/server/data/steps");
    const { weekThingStates } = await import("@/server/data/week");
    const plan = await openToday("a", { db, today: TODAY });
    const [cv, landlord] = plan.items.filter((i) => i.weekItemId);
    await reportStep(db, "a", cv.stepId!, "done", TODAY);
    await reportStep(db, "a", landlord.stepId!, "not", TODAY);
    const states = await weekThingStates(db, "a", TODAY);
    expect(states.map((s) => [s.done, s.partly, s.notToday])).toEqual([
      [true, 0, 0],
      [false, 0, 1],
      [false, 0, 0],
    ]);
    expect(states[1].letGoToday).toBe(true);
    // Another person sees nothing of this week.
    expect(await weekThingStates(db, "b", TODAY)).toEqual([]);
    const next = await openToday("a", { db, today: "2026-10-28" });
    expect(next.items.filter((i) => i.weekItemId).map((i) => i.title)).toEqual([
      "Sort the letters",
      "Email the landlord",
    ]);
    expect(week.items).toHaveLength(3);
  });
});
