import { describe, expect, it } from "vitest";
import { emptyModel, type IntakeModel } from "@/domain/intake";
import { isMenuExample, LAST_MINUTE, wakeStart } from "@/domain/plan-menu";
import {
  anchorKind,
  pickThings,
  spaceOut,
  thingCount,
  thingMinute,
  thingWhy,
  introDay,
  weekDay,
  type OpenThing,
} from "@/domain/week-picker";
import type { DayItem } from "@/domain/day-plan";

const thing = (n: number, over: Partial<OpenThing> = {}): OpenThing => ({
  id: "t" + n,
  title: "Thing " + n,
  what: "I want to do thing " + n,
  when: "",
  position: n,
  partly: 0,
  notToday: 0,
  done: false,
  ...over,
});
const three = [thing(0), thing(1), thing(2)];
const model = (over: Partial<IntakeModel> = {}): IntakeModel => ({
  ...emptyModel(),
  ...over,
});

describe("thingCount", () => {
  it("follows the energy table", () => {
    expect(thingCount("low", false)).toBe(1);
    expect(thingCount(null, false)).toBe(2);
    expect(thingCount("okay", false)).toBe(2);
    expect(thingCount("more", false)).toBe(3);
    expect(thingCount("more", true)).toBe(1);
    expect(thingCount(null, true)).toBe(1);
  });
});

describe("pickThings", () => {
  it("never picks more than the open things", () => {
    expect(pickThings([thing(0)], "more", false)).toHaveLength(1);
    expect(
      pickThings([thing(0, { done: true }), thing(1)], "more", false).map(
        (t) => t.id,
      ),
    ).toEqual(["t1"]);
  });
  it("orders by fewer Not today, then Partly, then position", () => {
    const picked = pickThings(
      [
        thing(0, { notToday: 2 }),
        thing(1),
        thing(2, { partly: 1 }),
        thing(3, { notToday: 1, partly: 3 }),
      ],
      "more",
      false,
    );
    expect(picked.map((t) => t.id)).toEqual(["t2", "t1", "t3"]);
  });
});

describe("thingWhy", () => {
  it("quotes the person's words", () => {
    expect(thingWhy("Update my CV\n before  Friday")).toBe(
      'Because you said "Update my CV before Friday"',
    );
  });
  it("quotes only the first clause, at most eight words", () => {
    expect(
      thingWhy(
        "Update my CV. I open it, then close it again because the gap year looks bad",
      ),
    ).toBe('Because you said "Update my CV"');
    expect(
      thingWhy("Sort out the spare room so my sister can stay over next month"),
    ).toBe('Because you said "Sort out the spare room so my sister…"');
  });
  it("cuts long words at a word boundary, inside the quotes, within 120", () => {
    const long = Array.from({ length: 40 }, (_, i) => "word" + i).join(" ");
    const why = thingWhy(long);
    expect(why.length).toBeLessThanOrEqual(120);
    expect(why).toMatch(/^Because you said "word0 .*word\d+…"$/);
    expect(long.startsWith(why.slice(18, -2))).toBe(true);
    const unbroken = thingWhy("x".repeat(300));
    expect(unbroken.length).toBeLessThanOrEqual(120);
    expect(unbroken.endsWith('…"')).toBe(true);
  });
});

describe("times", () => {
  it("puts things at wake+60, +150, +240", () => {
    const start = wakeStart("7to9");
    expect([0, 1, 2].map((p) => thingMinute(p, "7to9"))).toEqual([
      start + 60,
      start + 150,
      start + 240,
    ]);
  });
  it("moves the later of two clashing items 30 minutes on", () => {
    const at = (m: number, title: string): DayItem => ({
      kind: "task",
      title,
      why: "Because you said x",
      size: "small",
      minuteOfDay: m,
    });
    const out = spaceOut([at(600, "a"), at(610, "b"), at(LAST_MINUTE, "c")]);
    expect(out.map((x) => x.minuteOfDay)).toEqual([600, 630, LAST_MINUTE]);
  });
});

describe("weekDay", () => {
  it("builds things plus one anchor from the person's lifts", () => {
    const day = weekDay({
      things: three,
      energy: null,
      lighter: false,
      model: model({ lifts: ["music"] }),
    });
    const things = day.filter((x) => x.weekItemId);
    expect(things).toHaveLength(2);
    for (const t of things) {
      expect(t.kind).toBe("task");
      expect(t.size).toBe("small");
      expect(t.why).toMatch(/^Because you said "/);
    }
    const others = day.filter((x) => !x.weekItemId);
    expect(others).toHaveLength(1);
    expect(others[0].kind).toBe("enjoy");
    const minutes = day.map((x) => x.minuteOfDay);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });
  it("counts things by energy and lighter day", () => {
    const n = (energy: "low" | "okay" | "more" | null, lighter = false) =>
      weekDay({ things: three, energy, lighter, model: model() }).filter(
        (x) => x.weekItemId,
      ).length;
    expect(n("low")).toBe(1);
    expect(n("okay")).toBe(2);
    expect(n("more")).toBe(3);
    expect(n(null, true)).toBe(1);
  });
  it("adds one basics entry when the person chose the basics, not on low", () => {
    const m = model({ lifts: ["music"], goals: ["basics"] });
    const day = weekDay({
      things: three,
      energy: "okay",
      lighter: false,
      model: m,
    });
    expect(day.filter((x) => x.kind === "basics")).toHaveLength(1);
    const low = weekDay({
      things: three,
      energy: "low",
      lighter: false,
      model: m,
    });
    expect(low.filter((x) => x.kind === "basics")).toHaveLength(0);
    expect(low.filter((x) => !x.weekItemId)).toHaveLength(1);
  });
  it("uses no generic menu item except the anchor", () => {
    const day = weekDay({
      things: three,
      energy: "more",
      lighter: false,
      model: model({ lifts: ["reading"], goals: ["sleep", "energy"] }),
    });
    const generic = day.filter((x) => !x.weekItemId);
    expect(generic).toHaveLength(1);
    expect(day.filter((x) => isMenuExample(x.title) && x.weekItemId)).toEqual(
      [],
    );
  });
  it("keeps eating-concern rules for the anchor", () => {
    const m = model({ lifts: ["walking"], eatingConcern: true });
    expect(anchorKind(m)).not.toBe("move");
    const day = weekDay({
      things: three,
      energy: null,
      lighter: false,
      model: m,
    });
    const anchor = day.filter((x) => !x.weekItemId);
    expect(anchor).toHaveLength(1);
    expect(anchor[0].title.toLowerCase()).not.toMatch(/walk/);
  });
  it("without lifts, anchors on the first other kind of the day", () => {
    expect(anchorKind(model({ goals: ["sleep"] }))).toBe("wind_down");
    expect(anchorKind(model())).toBe("basics");
  });
  it("re-picks around locked things and skips things let go today", () => {
    const first = weekDay({
      things: three,
      energy: "more",
      lighter: false,
      model: model(),
    }).map((x, i) => ({ ...x, stepId: "s" + i }));
    const doneThing = first.find((x) => x.weekItemId === "t0")!;
    const low = weekDay({
      things: [thing(0, { done: true }), thing(1), thing(2)],
      energy: "low",
      lighter: false,
      model: model(),
      current: first,
      locked: new Set([doneThing.stepId!]),
      skip: new Set(["t1"]),
    });
    // The done thing fills the one place; the anchor stays.
    expect(low.filter((x) => x.weekItemId).map((x) => x.weekItemId)).toEqual([
      "t0",
    ]);
    expect(low.filter((x) => !x.weekItemId)).toHaveLength(1);
    const more = weekDay({
      things: three,
      energy: "more",
      lighter: false,
      model: model(),
      current: first,
      skip: new Set(["t1"]),
    });
    expect(more.filter((x) => x.weekItemId).map((x) => x.weekItemId)).toEqual([
      "t0",
      "t2",
    ]);
    // A thing already on the plan keeps its entry.
    expect(more.find((x) => x.weekItemId === "t0")!.stepId).toBe(
      doneThing.stepId,
    );
  });
});

describe("introDay", () => {
  const intro: DayItem[] = [
    {
      kind: "work_chunk",
      title: "Open the report",
      why: "Because a",
      size: "small",
      minuteOfDay: 780,
    },
    {
      kind: "enjoy",
      title: "Play one song",
      why: "Because b",
      size: "tiny",
      minuteOfDay: 1140,
    },
  ];
  const cap = (title: string) => ({
    captured: { what: title + " soon", title },
  });
  it("keeps intro items without a week", () => {
    expect(introDay(intro, [], "7to9")).toBe(intro);
  });
  it("is two things plus the intro lift as anchor, unchanged", () => {
    const day = introDay(
      intro,
      [{ id: "w1", ...cap("A") }, cap("B"), cap("C")],
      "7to9",
    );
    expect(day.map((i) => i.title).sort()).toEqual(["A", "B", "Play one song"]);
    expect(day[0].weekItemId).toBe("w1");
    expect(day[1].weekItemId).toBeUndefined();
    expect(day.find((i) => i.kind === "enjoy")).toEqual(intro[1]);
    expect(day[0].why).toBe('Because you said "A soon"');
  });
});
