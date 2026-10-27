// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { intakeModel, type IntakeInput } from "@/domain/intake";
import { checkComposition, contextFor } from "@/domain/plan-menu";

// A plain function, not vi.fn(): vitest tracks the promises a spy returns and
// reports a rejected one as unhandled even when the code under test catches it.
type Call = [{ content: string }[], unknown, Record<string, unknown>];
const model_ = vi.hoisted(() => ({
  impl: (async () => ({})) as (...args: Call) => Promise<unknown>,
  calls: [] as Call[],
}));
vi.mock("@/server/llm/nebius", () => ({
  completeJson: (...args: Call) => {
    model_.calls.push(args);
    return model_.impl(...args);
  },
  AiUnavailable: class AiUnavailable extends Error {},
}));
const completeJson = {
  get mock() {
    return model_;
  },
  mockResolvedValue(value: unknown) {
    model_.impl = async () => value;
  },
  mockImplementation(fn: (...args: Call) => Promise<unknown>) {
    model_.impl = fn;
  },
  mockReturnValue(value: Promise<unknown>) {
    model_.impl = () => value;
  },
  mockReset() {
    model_.calls = [];
    model_.impl = async () => ({});
  },
};

const model = (input: IntakeInput = {}) => intakeModel.parse(input);
const music = model({
  goals: ["energy"],
  wake: "7to9",
  lifts: ["music"],
  puttingOff: "my taxes",
});

const good = {
  summary: "You want more energy. Music used to lift you a little.",
  memories: [{ kind: "helps", text: "Music used to lift you a little." }],
  items: [
    {
      kind: "basics",
      title: "Drink a glass of water",
      why: "Because you said energy is what would help most",
      size: "tiny",
      minuteOfDay: 8 * 60,
    },
    {
      kind: "outside",
      title: "Open a window for a minute",
      why: "Because you want more energy",
      size: "tiny",
      minuteOfDay: 13 * 60,
    },
    {
      kind: "enjoy",
      title: "Put on one song you used to like",
      why: "Because you said music used to lift you",
      size: "tiny",
      minuteOfDay: 19 * 60,
    },
  ],
};

beforeEach(() => completeJson.mockReset());

async function run(m = music, timeoutMs?: number) {
  const { synthesiseIntake } = await import("@/server/llm/intake");
  return synthesiseIntake(m, "u1", { timeoutMs });
}

describe("synthesiseIntake", () => {
  it("uses a good reply as it is", async () => {
    completeJson.mockResolvedValue(good);
    const r = await run();
    expect(r.source).toBe("ai");
    expect(r.replaced).toBe(0);
    expect(r.summary).toBe(good.summary);
    expect(r.memories).toEqual(good.memories);
    expect(r.items.map((i) => i.title)).toEqual(good.items.map((i) => i.title));
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
    // One call, on the intake purpose, with the person's id for the budget.
    expect(model_.calls).toHaveLength(1);
    const options = completeJson.mock.calls[0][2];
    expect(options).toMatchObject({ purpose: "intake", userId: "u1" });
    expect(options.temperature).toBeCloseTo(0.4);
  });

  it("builds the prompt from the menu and the never-suggest list", async () => {
    completeJson.mockResolvedValue(good);
    await run();
    const [messages] = completeJson.mock.calls[0];
    const system: string = messages[0].content;
    expect(system).toContain("NEVER SUGGEST");
    expect(system).toContain("- reach_out ");
    expect(system).toContain("Exactly 3 items");
    expect(system).toMatch(/never use "we", "us", "together"/i);
    const user = JSON.parse(messages[1].content);
    expect(user.answers["used to lift them"]).toEqual(["Music"]);
  });

  it("replaces only the item that mentions skipping a meal", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: [
        good.items[0],
        {
          ...good.items[1],
          kind: "kind",
          title: "Skip a meal and rest instead",
        },
        good.items[2],
      ],
    });
    const r = await run();
    expect(r.source).toBe("ai");
    expect(r.replaced).toBe(1);
    expect(r.items.some((i) => /skip a meal/i.test(i.title))).toBe(false);
    expect(r.items.map((i) => i.title)).toContain("Drink a glass of water");
    expect(r.items.map((i) => i.title)).toContain(
      "Put on one song you used to like",
    );
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
  });

  it("replaces items that say we, us or together", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: [
        { ...good.items[0], why: "Because we can do this together" },
        good.items[1],
        good.items[2],
      ],
    });
    const r = await run();
    expect(r.replaced).toBe(1);
    expect(r.items.every((i) => !/\b(we|us|together)\b/i.test(i.why))).toBe(
      true,
    );
  });

  it("replaces an item that trips the safety rules", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: [
        { ...good.items[0], title: "Think about ending it all" },
        good.items[1],
        good.items[2],
      ],
    });
    const r = await run();
    expect(r.replaced).toBe(1);
    expect(r.items.every((i) => !/ending it all/.test(i.title))).toBe(true);
  });

  it("makes sure something from what lifts them is in the plan", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: [
        good.items[0],
        good.items[1],
        {
          kind: "kind",
          title: "Say one line to yourself that a friend would say",
          why: "Because a gentle word helps",
          size: "tiny",
          minuteOfDay: 19 * 60,
        },
      ],
    });
    const r = await run();
    expect(r.items.some((i) => i.kind === "enjoy")).toBe(true);
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
    expect(r.replaced).toBeGreaterThan(0);
  });

  it("drops a second reach out and a reach out nobody was named for", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: [
        good.items[0],
        {
          kind: "reach_out",
          title: "Send a friend a short hello",
          why: "Because you want to feel less alone",
          size: "small",
          minuteOfDay: 13 * 60,
        },
        good.items[2],
      ],
    });
    const r = await run();
    expect(r.items.some((i) => i.kind === "reach_out")).toBe(false);
    expect(r.replaced).toBe(1);
  });

  it("fixes times outside waking hours without throwing the items away", async () => {
    completeJson.mockResolvedValue({
      ...good,
      items: good.items.map((i, n) => ({ ...i, minuteOfDay: 3 * 60 + n })),
    });
    const r = await run();
    expect(r.replaced).toBe(0);
    expect(r.items.map((i) => i.title).sort()).toEqual(
      good.items.map((i) => i.title).sort(),
    );
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
  });

  it("cleans memories and the summary of banned or unsafe text", async () => {
    completeJson.mockResolvedValue({
      ...good,
      summary: "We will get through this together.",
      memories: [
        { kind: "helps", text: "Try a supplement for energy" },
        { kind: "helps", text: "Music used to lift you a little." },
      ],
    });
    const r = await run();
    expect(r.summary).toMatch(/^You/);
    expect(r.memories).toEqual([
      { kind: "helps", text: "Music used to lift you a little." },
    ]);
  });

  it("keeps food and exercise out of everything when an eating concern is flagged", async () => {
    const m = model({
      eatingConcern: true,
      goals: ["energy"],
      lifts: ["music"],
    });
    completeJson.mockResolvedValue({
      summary: "You want more energy and to eat well.",
      memories: [{ kind: "helps", text: "A morning walk helps you" }],
      items: [
        {
          kind: "basics",
          title: "Eat something, anything small",
          why: "Because you want more energy",
          size: "tiny",
          minuteOfDay: 8 * 60,
        },
        {
          kind: "move",
          title: "Stretch for two minutes",
          why: "Because you want more energy",
          size: "tiny",
          minuteOfDay: 13 * 60,
        },
        good.items[2],
      ],
    });
    const r = await run(m);
    expect(r.memories).toEqual([]);
    expect(r.summary).not.toMatch(/eat/i);
    expect(r.items.map((i) => i.kind)).not.toContain("move");
    expect(r.items.some((i) => /eat/i.test(i.title))).toBe(false);
    expect(checkComposition(r.items, contextFor(m))).toEqual([]);
    expect(r.replaced).toBe(2);
    const system: string = completeJson.mock.calls[0][0][0].content;
    expect(system).toMatch(/worry about food or weight/);
  });

  it("falls back to the rules-based plan when the model is unavailable", async () => {
    // Rejects when called, not when set up, so nothing is left unhandled.
    completeJson.mockImplementation(() =>
      Promise.reject(new Error("AI unavailable: switched off")),
    );
    const r = await run();
    expect(r.source).toBe("fallback");
    expect(r.items).toHaveLength(3);
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
    expect(r.summary).toMatch(/^You/);
  });

  it("falls back when the model takes too long", async () => {
    completeJson.mockReturnValue(new Promise(() => {}));
    const r = await run(music, 30);
    expect(r.source).toBe("fallback");
    expect(checkComposition(r.items, contextFor(music))).toEqual([]);
  });

  it("does not call the model when nothing was answered", async () => {
    const r = await run(model());
    expect(r.source).toBe("fallback");
    expect(model_.calls).toHaveLength(0);
    expect(r.items).toHaveLength(3);
  });
});
