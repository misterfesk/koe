import { describe, expect, it } from "vitest";
import {
  adaptLighter,
  adaptLow,
  adaptMore,
  constrainSizes,
  keepAnchor,
  diffLines,
  diffPlans,
  isEmptyDiff,
  laterOptions,
  nextSize,
  plainDay,
  repairDayPlan,
  shouldGoLighter,
  smallerVersion,
  templateNote,
  type DayItem,
  type KindOutcome,
} from "@/domain/day-plan";
import { intakeModel } from "@/domain/intake";
import {
  checkComposition,
  contextFor,
  fallbackPlan,
  guardrailHits,
} from "@/domain/plan-menu";
import { formatClock, uses12Hour } from "@/domain/time";

const model = intakeModel.parse({
  goals: ["work_study", "energy"],
  wake: "7to9",
  days: "working",
  lifts: ["music", "walking"],
  people: ["friend"],
  names: [{ name: "Sam", save: false }],
});

/** A five-item day with a mix of sizes, each with a step id. */
function fiveItems(): DayItem[] {
  const items: DayItem[] = [
    {
      stepId: "a",
      kind: "basics",
      title: "Wash your face and change into fresh clothes",
      why: "Because you said energy would help most",
      size: "small",
      minuteOfDay: 8 * 60,
    },
    {
      stepId: "b",
      kind: "move",
      title: "Take a ten-minute walk",
      why: "Because you said energy and motivation would help most",
      size: "small",
      minuteOfDay: 9 * 60,
    },
    {
      stepId: "c",
      kind: "work_chunk",
      title: "Work for 15 minutes, then take a 5-minute break",
      why: "Because you said work or study would help most",
      size: "small",
      minuteOfDay: 13 * 60,
    },
    {
      stepId: "d",
      kind: "reach_out",
      title: "Send Sam a short hello",
      why: "Because you named Sam as someone in your corner",
      size: "small",
      minuteOfDay: 15 * 60,
    },
    {
      stepId: "e",
      kind: "enjoy",
      title: "Listen to a few songs you used to like",
      why: "Because you said music used to lift you",
      size: "small",
      minuteOfDay: 19 * 60,
    },
  ];
  return items;
}

const out = (
  kind: KindOutcome["kind"],
  size: KindOutcome["size"],
  outcome: KindOutcome["outcome"],
  day: string,
): KindOutcome => ({ kind, size, outcome, day });

describe("the size rule", () => {
  it("steps up only after the last item of that kind was done at its size", () => {
    const base = { kind: "move", current: "tiny", firstDay: false } as const;
    expect(
      nextSize({
        ...base,
        history: [out("move", "tiny", "done", "2026-10-26")],
      }),
    ).toBe("small");
    // Done at a different size does not count.
    expect(
      nextSize({
        ...base,
        history: [out("move", "small", "done", "2026-10-26")],
      }),
    ).toBe("tiny");
    // Partly is not completion.
    expect(
      nextSize({
        ...base,
        history: [out("move", "tiny", "partly", "2026-10-26")],
      }),
    ).toBe("tiny");
    // Another kind does not count.
    expect(
      nextSize({
        ...base,
        history: [out("basics", "tiny", "done", "2026-10-26")],
      }),
    ).toBe("tiny");
    // Medium is the ceiling.
    expect(
      nextSize({
        kind: "move",
        current: "medium",
        firstDay: false,
        history: [out("move", "medium", "done", "2026-10-26")],
      }),
    ).toBe("medium");
  });

  it("steps down after two misses in a row, with tiny as the floor", () => {
    const two = [
      out("task", "small", "not", "2026-10-26"),
      out("task", "small", "not", "2026-10-25"),
    ];
    const base = { kind: "task", firstDay: false, history: two } as const;
    expect(nextSize({ ...base, current: "small" })).toBe("tiny");
    expect(nextSize({ ...base, current: "tiny" })).toBe("tiny");
    // One miss is not enough; a done in between breaks the run.
    expect(
      nextSize({
        kind: "task",
        current: "small",
        firstDay: false,
        history: [two[0]],
      }),
    ).toBe("small");
    expect(
      nextSize({
        kind: "task",
        current: "small",
        firstDay: false,
        history: [
          two[0],
          out("task", "small", "partly", "2026-10-25"),
          out("task", "small", "not", "2026-10-24"),
        ],
      }),
    ).toBe("small");
  });

  it("never moves on the first day", () => {
    expect(
      nextSize({
        kind: "move",
        current: "tiny",
        firstDay: true,
        history: [out("move", "tiny", "done", "2026-10-26")],
      }),
    ).toBe("tiny");
    expect(
      adaptMore(
        fiveItems(),
        model,
        [out("move", "small", "done", "2026-10-26")],
        true,
      ),
    ).toEqual(fiveItems());
  });

  it("a plain later day follows the history and changes the wording", () => {
    const history = [out("enjoy", "tiny", "done", "2026-10-27")];
    const one = plainDay(model, { day: "2026-10-28", history });
    const two = plainDay(model, { day: "2026-10-29", history });
    expect(checkComposition(one, contextFor(model, false))).toEqual([]);
    const enjoy = one.find((i) => i.kind === "enjoy");
    // The enjoy item was done at tiny, so it is small now.
    if (enjoy) expect(enjoy.size).toBe("small");
    expect(one.map((i) => i.title)).not.toEqual(two.map((i) => i.title));
  });
});

describe("rules-based adaptation", () => {
  it("low energy shrinks every item one size and keeps at most three with an anchor", () => {
    const items = fiveItems();
    const low = adaptLow(items, model);
    expect(low.length).toBeLessThanOrEqual(3);
    expect(low.some((i) => i.kind === "basics")).toBe(true);
    expect(low.some((i) => i.kind === "enjoy")).toBe(true);
    for (const l of low) {
      const was = items.find((i) => i.stepId === l.stepId);
      // Items that changed are new (no step id) and strictly smaller.
      if (!was) expect(l.size).toBe("tiny");
    }
    expect(low.every((i) => i.size === "tiny" || i.stepId)).toBe(true);
    expect(
      checkComposition(low, { ...contextFor(model, false), lighter: true }),
    ).toEqual([]);
    for (const i of low) expect(guardrailHits(i.title)).toEqual([]);
  });

  it("leaves a day of tiny items as it is", () => {
    const tiny = fallbackPlan(intakeModel.parse({}));
    expect(tiny.every((i) => i.size === "tiny")).toBe(true);
    const low = adaptLow(tiny, intakeModel.parse({}));
    expect(isEmptyDiff(diffPlans(tiny, low))).toBe(true);
  });

  it("keeps done items exactly", () => {
    const items = fiveItems();
    const low = adaptLow(items, model, new Set(["c", "d"]));
    expect(low.find((i) => i.stepId === "c")).toEqual(items[2]);
    expect(low.find((i) => i.stepId === "d")).toEqual(items[3]);
  });

  it("more energy steps up one item, and only a kind that was done at its size", () => {
    const items = fiveItems().map((i) =>
      i.kind === "move"
        ? { ...i, size: "tiny" as const, title: "Stretch for two minutes" }
        : i,
    );
    const history = [out("move", "tiny", "done", "2026-10-26")];
    const more = adaptMore(items, model, history, false);
    const grown = diffPlans(items, more);
    expect(grown.grown).toHaveLength(1);
    expect(grown.grown[0].to.kind).toBe("move");
    // Nothing qualifies without a done item.
    expect(
      isEmptyDiff(diffPlans(items, adaptMore(items, model, [], false))),
    ).toBe(true);
  });

  it("a lighter day is one tiny item plus one anchor", () => {
    const light = adaptLighter(fiveItems(), model);
    expect(light).toHaveLength(2);
    expect(light.every((i) => i.size === "tiny")).toBe(true);
    expect(light.some((i) => i.kind === "basics" || i.kind === "enjoy")).toBe(
      true,
    );
    expect(
      checkComposition(light, { ...contextFor(model, false), lighter: true }),
    ).toEqual([]);
  });

  it("a smaller version is a different, smaller item or nothing", () => {
    const small = fiveItems()[1];
    const smaller = smallerVersion(small, model)!;
    expect(smaller.size).toBe("tiny");
    expect(smaller.title).not.toBe(small.title);
    expect(smaller.kind).toBe("move");
  });
});

describe("the lighter-day trigger", () => {
  it("needs two earlier days in a row with nothing done or partly done", () => {
    const d = (day: string, active: number) => ({ day, active });
    expect(shouldGoLighter([])).toBe(false);
    expect(shouldGoLighter([d("2026-10-26", 0)])).toBe(false);
    expect(shouldGoLighter([d("2026-10-26", 0), d("2026-10-25", 0)])).toBe(
      true,
    );
    expect(shouldGoLighter([d("2026-10-26", 0), d("2026-10-25", 2)])).toBe(
      false,
    );
    expect(shouldGoLighter([d("2026-10-26", 1), d("2026-10-25", 0)])).toBe(
      false,
    );
  });
});

describe("diffPlans", () => {
  const items = fiveItems();

  it("sees nothing when nothing changed", () => {
    expect(isEmptyDiff(diffPlans(items, items))).toBe(true);
  });

  it("sorts changes into shrunk, swapped, grown, moved, added and removed", () => {
    const next: DayItem[] = [
      // moved
      { ...items[0], minuteOfDay: 8 * 60 + 30 },
      // shrunk (new step)
      {
        ...items[1],
        stepId: undefined,
        size: "tiny",
        title: "Stretch for two minutes",
      },
      // swapped (same kind and size, new words)
      { ...items[2], stepId: undefined, title: "Open the document you need" },
      // removed: items[3]
      // grown
      {
        ...items[4],
        stepId: undefined,
        size: "medium",
        title: "Go out for 30 minutes to somewhere you like",
      },
    ];
    const d = diffPlans(items, next);
    expect(d.moved.map((x) => x.item.kind)).toEqual(["basics"]);
    expect(d.shrunk.map((x) => x.to.title)).toEqual([
      "Stretch for two minutes",
    ]);
    expect(d.swapped.map((x) => x.to.title)).toEqual([
      "Open the document you need",
    ]);
    expect(d.grown).toHaveLength(1);
    expect(d.removed.map((x) => x.kind)).toEqual(["reach_out"]);
    expect(d.added).toEqual([]);
    const lines = diffLines(d, (m) => formatClock(m, false));
    expect(lines).toContain("Take a ten-minute walk → Stretch for two minutes");
    expect(lines).toContain("Taken off today: Send Sam a short hello");
    expect(lines.some((l) => l.includes("08:00 → 08:30"))).toBe(true);
  });

  it("a different kind taking another's place is a swap; extras are added", () => {
    const extra: DayItem = {
      kind: "kind",
      title: "Say one line a friend would say",
      why: "Because a gentle word costs nothing",
      size: "tiny",
      minuteOfDay: 20 * 60,
    };
    expect(diffPlans(items, [...items, extra]).added).toEqual([extra]);
    const swapped = diffPlans(items.slice(0, 4), [...items.slice(0, 3), extra]);
    expect(swapped.swapped).toHaveLength(1);
    expect(swapped.swapped[0].to).toEqual(extra);
  });

  it("writes a note without pronouns, and says plainly when nothing changed", () => {
    const next = items.map((i, n) =>
      n === 1
        ? {
            ...i,
            stepId: undefined,
            size: "tiny" as const,
            title: "Stretch for two minutes",
          }
        : i,
    );
    const note = templateNote(diffPlans(items, next), {
      reason: "check_in",
      energy: "low",
    });
    expect(note).toBe(
      'Lighter day: Swapped "Take a ten-minute walk" for "Stretch for two minutes".',
    );
    expect(note).not.toMatch(/\b(I|we|us|together)\b/);
    expect(
      templateNote(diffPlans(items, items), {
        reason: "check_in",
        energy: "low",
      }),
    ).toBe("Your plan already fits a low day.");
  });
});

describe("moving later", () => {
  it("offers an hour on, this afternoon and this evening, only after the item", () => {
    expect(laterOptions(9 * 60).map((o) => [o.label, o.minute])).toEqual([
      ["In an hour", 10 * 60],
      ["This afternoon", 15 * 60],
      ["This evening", 19 * 60],
    ]);
    expect(laterOptions(14 * 60 + 30).map((o) => o.label)).toEqual([
      "In an hour",
      "This evening",
    ]);
    expect(laterOptions(21 * 60).map((o) => o.label)).toEqual([]);
  });
});

describe("clocks", () => {
  it("writes 12 or 24 hour times", () => {
    expect(formatClock(8 * 60, false)).toBe("08:00");
    expect(formatClock(8 * 60 + 5, true)).toBe("8:05 am");
    expect(formatClock(0, true)).toBe("12:00 am");
    expect(formatClock(13 * 60, true)).toBe("1:00 pm");
    expect(uses12Hour("en-US,en;q=0.9")).toBe(true);
    expect(uses12Hour("en-GB")).toBe(false);
    expect(uses12Hour("de-DE,de;q=0.9")).toBe(false);
  });
});

describe("repairing a model's day", () => {
  const current = fiveItems();
  const ctx = contextFor(model, false);
  const run = (proposed: DayItem[], locked: string[] = []) =>
    repairDayPlan({
      proposed,
      current,
      locked: new Set(locked),
      model,
      ctx,
    });

  it("accepts a day that follows the rules as it is", () => {
    const r = run(current);
    expect(r?.replaced).toBe(0);
    expect(r?.items).toEqual(current);
  });

  it("replaces only the item that breaks a guardrail", () => {
    const bad = current.map((i) =>
      i.stepId === "b"
        ? { ...i, stepId: undefined, title: "Burn off breakfast with a run" }
        : i,
    );
    const r = run(bad)!;
    expect(r.replaced).toBe(1);
    expect(r.items.some((i) => /burn|breakfast/i.test(i.title))).toBe(false);
    expect(r.items.map((i) => i.stepId).filter(Boolean)).toHaveLength(4);
    expect(checkComposition(r.items, ctx)).toEqual([]);
  });

  it("puts a done item back if the model dropped it", () => {
    const r = run(
      current.filter((i) => i.stepId !== "c"),
      ["c"],
    )!;
    expect(r.items.find((i) => i.stepId === "c")).toEqual(current[2]);
  });

  it("fixes times outside waking hours", () => {
    const r = run(
      current.map((i, n) => (n === 0 ? { ...i, minuteOfDay: 3 * 60 } : i)),
    )!;
    expect(
      Math.min(...r.items.map((i) => i.minuteOfDay)),
    ).toBeGreaterThanOrEqual(8 * 60);
  });

  it("refuses a second reach out and a missing anchor by replacing, not by giving up", () => {
    const twice = current.map((i) =>
      i.stepId === "b"
        ? {
            ...i,
            stepId: undefined,
            kind: "reach_out" as const,
            title: "Send Sam a thumbs-up",
            size: "tiny" as const,
          }
        : i,
    );
    const r = run(twice)!;
    expect(r.items.filter((i) => i.kind === "reach_out")).toHaveLength(1);
    expect(checkComposition(r.items, ctx)).toEqual([]);
  });

  it("holds a low day to its size limits", () => {
    const grown = current.map((i) =>
      i.stepId === "a" ? { ...i, size: "medium" as const } : i,
    );
    const limited = constrainSizes({
      items: grown,
      current,
      locked: new Set(),
      model,
      mode: "low",
      history: [],
      firstDay: false,
    });
    // Not smaller than before: replaced by the smaller version of the original.
    const a = limited.find((i) => i.kind === "basics")!;
    expect(a.size).toBe("tiny");
    // Unchanged items on a low day are also made smaller.
    expect(limited.filter((i) => i.size === "small")).toHaveLength(0);
  });

  it("starts anything new on a low day tiny, so a swap can't keep the day as big", () => {
    const swapped = current.map((i, n) =>
      n === 0
        ? {
            ...i,
            stepId: undefined,
            title: "A new thing",
            size: "small" as const,
          }
        : i,
    );
    const limited = constrainSizes({
      items: swapped,
      current,
      locked: new Set(),
      model,
      mode: "low",
      history: [],
      firstDay: false,
    });
    expect(limited.every((i) => i.size === "tiny")).toBe(true);
  });

  it("brings an anchor back tiny when a low day lost both basics and enjoy", () => {
    const anchored = current.filter(
      (i) => i.kind === "basics" || i.kind === "enjoy",
    );
    expect(anchored.length).toBeGreaterThan(0);
    const without = current.filter(
      (i) => i.kind !== "basics" && i.kind !== "enjoy",
    );
    const out = keepAnchor(without, current, new Set(), model);
    const back = out.filter((i) => i.kind === "basics" || i.kind === "enjoy");
    expect(back).toHaveLength(1);
    expect(back[0].size).toBe("tiny");
    expect(out.length).toBeLessThanOrEqual(Math.max(3, without.length));
  });
});
