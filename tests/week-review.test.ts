// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

type Db = Awaited<ReturnType<(typeof import("@/server/db"))["openDb"]>>;
let db: Db;
let schema: typeof import("@/server/db/schema");
let data: typeof import("@/server/data/week");
let steps: typeof import("@/server/data/steps");
beforeAll(async () => {
  process.env.NEBIUS_API_KEY = "test-key-never-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // The model is off: today's draft is rebuilt by rules only.
  process.env.KOE_AI = "off";
  db = await (await import("@/server/db")).openDb("memory:");
  schema = await import("@/server/db/schema");
  data = await import("@/server/data/week");
  steps = await import("@/server/data/steps");
}, 30_000);

const STARTED = "2026-10-21";
const DUE = "2026-10-28";
const thing = (title: string, when = "") => ({
  captured: { what: title, when, title },
});

async function person() {
  const id = crypto.randomUUID();
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@example.com` });
  await db
    .insert(schema.profile)
    .values({ userId: id, onboardedAt: new Date() });
  return id;
}
/** A week started a week ago: "CV" (done), "Landlord email" (partly), "Plants". */
async function dueWeek(userId: string) {
  const saved = await data.saveWeek(db, userId, {
    draft: {
      items: [
        thing("Update my CV", "Friday"),
        thing("Email the landlord"),
        thing("Repot the plants"),
      ],
    },
    today: STARTED,
    eatingConcern: false,
  });
  const [cv, landlord] = saved.items;
  const done = await steps.createStep(
    db,
    userId,
    { area: "do", title: "Update my CV", when: "today", weekItemId: cv.id },
    STARTED,
  );
  await steps.reportStep(db, userId, done, "done", STARTED);
  const partly = await steps.createStep(
    db,
    userId,
    {
      area: "do",
      title: "Email the landlord",
      when: "today",
      weekItemId: landlord.id,
    },
    STARTED,
  );
  await steps.reportStep(db, userId, partly, "partly", STARTED);
  await db
    .update(schema.weekItem)
    .set({ topic: "work" })
    .where(eq(schema.weekItem.id, landlord.id));
  return saved;
}

describe("week review", () => {
  it("is due only from reviewOn and until it is answered", async () => {
    const a = await person();
    const week = await dueWeek(a);
    expect(week.reviewOn).toBe(DUE);
    expect(await data.dueWeekReview(db, a, "2026-10-27")).toBeNull();
    const due = await data.dueWeekReview(db, a, DUE);
    expect(due?.week.id).toBe(week.id);
    expect(due?.things.map((t) => [t.title, t.done, t.partly])).toEqual([
      ["Update my CV", true, 0],
      ["Email the landlord", false, 1],
      ["Repot the plants", false, 0],
    ]);
    expect(await data.dueWeekReview(db, a, "2026-11-03")).not.toBeNull();
  });

  it("keeps, changes and lets go into a new week, never carrying done things", async () => {
    const a = await person();
    const week = await dueWeek(a);
    const [, landlord, plants] = week.items;
    const next = await data.reviewWeek(db, a, {
      weekId: week.id,
      expectedVersion: week.version,
      today: DUE,
      createId: crypto.randomUUID(),
      decisions: [
        { itemId: landlord.id, choice: "keep" },
        {
          itemId: plants.id,
          choice: "change",
          title: "repot the big plant by Sunday",
          when: "Sunday",
        },
      ],
    });
    expect(next).not.toBeNull();
    expect(next!.startedOn).toBe(DUE);
    expect(next!.reviewOn).toBe("2026-11-04");
    expect(next!.items.map((i) => i.captured)).toEqual([
      { what: "Email the landlord", when: "", title: "Email the landlord" },
      {
        what: "Repot the big plant",
        when: "Sunday",
        title: "Repot the big plant",
      },
    ]);
    // The kept thing keeps its Shelf topic; the changed one is classified again.
    const rows = await db
      .select()
      .from(schema.weekItem)
      .where(eq(schema.weekItem.weekId, next!.id))
      .orderBy(schema.weekItem.order);
    expect(rows.map((r) => r.topic)).toEqual(["work", null]);
    // The old week is closed; the newest week drives Today and the planner.
    expect(await data.dueWeekReview(db, a, DUE)).toBeNull();
    expect((await data.getWeek(db, a, week.id))?.reviewedAt).toBeTruthy();
    const states = await data.weekThingStates(db, a, DUE);
    expect(states.map((t) => t.title)).toEqual([
      "Email the landlord",
      "Repot the big plant",
    ]);
    expect(states.every((t) => !t.done && t.partly === 0)).toBe(true);
  });

  it("closes the week without a new one when everything is let go", async () => {
    const a = await person();
    const week = await dueWeek(a);
    const [, landlord, plants] = week.items;
    const next = await data.reviewWeek(db, a, {
      weekId: week.id,
      expectedVersion: week.version,
      today: DUE,
      createId: crypto.randomUUID(),
      decisions: [
        { itemId: landlord.id, choice: "let_go" },
        { itemId: plants.id, choice: "let_go" },
      ],
    });
    expect(next).toBeNull();
    expect(await data.dueWeekReview(db, a, DUE)).toBeNull();
    // No week: the strip and the planner see nothing, and nothing comes back.
    expect(await data.weekThingStates(db, a, DUE)).toEqual([]);
    expect(await data.weekThingStates(db, a, "2026-11-10")).toEqual([]);
    // Adding to the closed week is refused; a new week starts instead.
    await expect(
      data.saveWeek(db, a, {
        draft: { items: [thing("Call the bank")] },
        today: DUE,
        eatingConcern: false,
        weekId: week.id,
        expectedVersion: week.version + 1,
      }),
    ).rejects.toThrow("This week changed. Open it again before saving.");
    await data.saveWeek(db, a, {
      draft: { items: [thing("Call the bank")] },
      today: DUE,
      eatingConcern: false,
    });
    expect(
      (await data.weekThingStates(db, a, DUE)).map((t) => t.title),
    ).toEqual(["Call the bank"]);
  });

  it("rejects a stale version, missing choices, another person's week and an unanswered due date", async () => {
    const a = await person();
    const b = await person();
    const week = await dueWeek(a);
    const [, landlord, plants] = week.items;
    const decisions = [
      { itemId: landlord.id, choice: "keep" as const },
      { itemId: plants.id, choice: "let_go" as const },
    ];
    const base = { weekId: week.id, today: DUE, decisions };
    await expect(
      data.reviewWeek(db, a, {
        ...base,
        expectedVersion: week.version + 1,
        createId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("This week changed. Open it again before saving.");
    await expect(
      data.reviewWeek(db, a, {
        ...base,
        expectedVersion: week.version,
        createId: crypto.randomUUID(),
        decisions: decisions.slice(0, 1),
      }),
    ).rejects.toThrow("This week changed. Open it again before saving.");
    await expect(
      data.reviewWeek(db, a, {
        ...base,
        expectedVersion: week.version,
        createId: crypto.randomUUID(),
        today: "2026-10-27",
      }),
    ).rejects.toThrow("This week changed. Open it again before saving.");
    await expect(
      data.reviewWeek(db, b, {
        ...base,
        expectedVersion: week.version,
        createId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("Open this week again before saving.");
    // Nothing was written by the failed attempts.
    expect((await data.getWeek(db, a, week.id))?.reviewedAt).toBeNull();
    expect(await data.listWeeks(db, a)).toHaveLength(1);
  });

  it("saves once for a repeated createId", async () => {
    const a = await person();
    const week = await dueWeek(a);
    const [, landlord, plants] = week.items;
    const input = {
      weekId: week.id,
      expectedVersion: week.version,
      today: DUE,
      createId: crypto.randomUUID(),
      decisions: [
        { itemId: landlord.id, choice: "keep" as const },
        { itemId: plants.id, choice: "let_go" as const },
      ],
    };
    const first = await data.reviewWeek(db, a, input);
    const again = await data.reviewWeek(db, a, input);
    expect(again?.id).toBe(first?.id);
    expect(first?.id).toBe(input.createId);
    expect(await data.listWeeks(db, a)).toHaveLength(2);
  });

  it("tidies a changed title and rejects empty or unsafe words", async () => {
    const a = await person();
    const week = await dueWeek(a);
    const [, landlord, plants] = week.items;
    const review = (title: string) =>
      data.reviewWeek(db, a, {
        weekId: week.id,
        expectedVersion: week.version,
        today: DUE,
        createId: crypto.randomUUID(),
        decisions: [
          { itemId: landlord.id, choice: "change", title, when: "" },
          { itemId: plants.id, choice: "let_go" },
        ],
      });
    await expect(review("  ")).rejects.toThrow("Give it a few words.");
    await expect(review("Lose weight before Friday")).rejects.toThrow(
      "Try different words for this one.",
    );
    const next = await review("ring the landlord about the boiler.");
    expect(next?.items[0].captured.title).toBe(
      "Ring the landlord about the boiler",
    );
  });

  describe("today's draft after the review", () => {
    /** A due week, and today's plan still the draft made from it. */
    async function draftDay() {
      const a = await person();
      const week = await dueWeek(a);
      const { openToday } = await import("@/server/llm/planner");
      await openToday(a, { db, today: STARTED });
      const draft = await openToday(a, { db, today: DUE });
      expect(draft.version).toBe(1);
      expect(draft.reason).toBe("draft");
      return { a, week, draft };
    }
    const review = (
      a: string,
      week: Awaited<ReturnType<typeof dueWeek>>,
      plants: "keep" | "let_go",
    ) =>
      data.reviewWeek(db, a, {
        weekId: week.id,
        expectedVersion: week.version,
        today: DUE,
        createId: crypto.randomUUID(),
        decisions: [
          { itemId: week.items[1].id, choice: "keep" },
          { itemId: week.items[2].id, choice: plants },
        ],
      });
    const titles = async (a: string) => {
      const { getPlanDay } = await import("@/server/data/intake");
      const plan = (await getPlanDay(db, a, DUE))!;
      return { plan, titles: plan.items.map((i) => i.title) };
    };

    it("rebuilds an unanswered draft from the new week", async () => {
      const { a, week, draft } = await draftDay();
      expect(draft.items.map((i) => i.title)).toContain("Repot the plants");
      const next = await review(a, week, "let_go");
      const { redraftToday } = await import("@/server/llm/planner");
      expect(await redraftToday(a, { db, today: DUE })).toBe(true);
      const { plan, titles: now } = await titles(a);
      expect(now).toContain("Email the landlord");
      expect(now).not.toContain("Repot the plants");
      // Still the one draft to keep or simplify, now linked to the new week.
      expect(plan.version).toBe(1);
      expect(plan.reason).toBe("draft");
      const thingIds = plan.items.flatMap((i) =>
        i.weekItemId ? [i.weekItemId] : [],
      );
      expect(thingIds).toEqual([next!.items[0].id]);
    });

    it("drops the old week's entries when everything is let go", async () => {
      const { a, week } = await draftDay();
      await data.reviewWeek(db, a, {
        weekId: week.id,
        expectedVersion: week.version,
        today: DUE,
        createId: crypto.randomUUID(),
        decisions: [
          { itemId: week.items[1].id, choice: "let_go" },
          { itemId: week.items[2].id, choice: "let_go" },
        ],
      });
      const { redraftToday } = await import("@/server/llm/planner");
      expect(await redraftToday(a, { db, today: DUE })).toBe(true);
      const { plan } = await titles(a);
      expect(plan.items.length).toBeGreaterThan(0);
      expect(plan.items.some((i) => i.weekItemId)).toBe(false);
    });

    it("leaves a kept plan as it is", async () => {
      const { a, week } = await draftDay();
      const { keepDraft } = await import("@/server/data/plan");
      expect((await keepDraft(db, a, DUE)).ok).toBe(true);
      const before = await titles(a);
      await review(a, week, "let_go");
      const { redraftToday } = await import("@/server/llm/planner");
      expect(await redraftToday(a, { db, today: DUE })).toBe(false);
      const after = await titles(a);
      expect(after.titles).toEqual(before.titles);
      expect(after.titles).toContain("Repot the plants");
      expect(after.plan.reason).toBe("draft_kept");
    });

    it("leaves a draft with an answered entry as it is", async () => {
      const { a, week, draft } = await draftDay();
      const landlord = draft.items.find(
        (i) => i.title === "Email the landlord",
      )!;
      await steps.reportStep(db, a, landlord.stepId!, "partly", DUE);
      await review(a, week, "let_go");
      const { redraftToday } = await import("@/server/llm/planner");
      expect(await redraftToday(a, { db, today: DUE })).toBe(false);
      const after = await titles(a);
      expect(after.titles).toEqual(draft.items.map((i) => i.title));
      expect(after.plan.version).toBe(1);
    });
  });
});
