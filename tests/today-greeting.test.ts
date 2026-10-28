import { describe, expect, it } from "vitest";
import {
  dateLine,
  greetingFor,
  stateLine,
  weekMeta,
} from "@/features/today/greeting-copy";

const at = (h: number, m = 0) => h * 60 + m;

describe("greetingFor", () => {
  it("follows the local time bands", () => {
    expect(greetingFor(at(4, 59))).toBe("Hello");
    expect(greetingFor(at(5))).toBe("Good morning");
    expect(greetingFor(at(11, 59))).toBe("Good morning");
    expect(greetingFor(at(12))).toBe("Good afternoon");
    expect(greetingFor(at(16, 59))).toBe("Good afternoon");
    expect(greetingFor(at(17))).toBe("Good evening");
    expect(greetingFor(at(21, 59))).toBe("Good evening");
    expect(greetingFor(at(22))).toBe("Hello");
    expect(greetingFor(0)).toBe("Hello");
  });
  it("adds the first word of the name, and nothing for guests", () => {
    expect(greetingFor(at(9), "Ana Maria Lopez")).toBe("Good morning, Ana");
    expect(greetingFor(at(9), "  ")).toBe("Good morning");
    expect(greetingFor(at(9), null)).toBe("Good morning");
  });
});

describe("dateLine", () => {
  it("reads in the person's timezone", () => {
    const t = new Date("2026-10-28T23:30:00Z");
    expect(dateLine("UTC", t)).toBe("Wednesday 28 October");
    expect(dateLine("Pacific/Auckland", t)).toBe("Thursday 29 October");
    expect(dateLine("Not/AZone", t)).toBe("Wednesday 28 October");
  });
});

describe("stateLine", () => {
  const base = { lighter: false, waiting: 0, answered: 0 };
  it("covers every state", () => {
    expect(stateLine({ ...base, lighter: true, waiting: 3 })).toBe(
      "A lighter day",
    );
    expect(stateLine(base)).toBe("Nothing planned yet");
    expect(stateLine({ ...base, answered: 2 })).toBe("All done for today");
    expect(stateLine({ ...base, waiting: 1 })).toBe("1 thing today");
    expect(stateLine({ ...base, waiting: 3, answered: 1 })).toBe(
      "3 things today",
    );
  });
});

describe("weekMeta", () => {
  it("says what moved", () => {
    expect(weekMeta({ done: true, partly: 2 })).toBe("Done");
    expect(weekMeta({ done: false, partly: 0 })).toBeNull();
    expect(weekMeta({ done: false, partly: 1 })).toBe("Moved forward once");
    expect(weekMeta({ done: false, partly: 2 })).toBe("Moved forward twice");
    expect(weekMeta({ done: false, partly: 4 })).toBe("Moved forward 4 times");
  });
});
