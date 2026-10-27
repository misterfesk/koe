import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  durationMinutes,
  escapeText,
  foldLine,
} from "@/domain/ics";
import {
  canSendKoeNudge,
  EVERY_DAY,
  inQuietHours,
  nextReminderAt,
  remindsOnce,
  reminderPayload,
} from "@/domain/reminders";

describe("next fire time", () => {
  it("morning plan: 08:00 in London crosses the end of summer time", () => {
    // Summer time ends 02:00 on 25 Oct 2026, so 08:00 is UTC+1 on the 24th
    // and UTC+0 on the 25th.
    const m = { minuteOfDay: 8 * 60, days: EVERY_DAY };
    expect(
      nextReminderAt(
        m,
        "Europe/London",
        new Date("2026-10-24T06:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-10-24T07:00:00.000Z");
    expect(
      nextReminderAt(
        m,
        "Europe/London",
        new Date("2026-10-24T08:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-10-25T08:00:00.000Z");
  });

  it("item: 15:00 in Singapore has no daylight saving", () => {
    const item = { minuteOfDay: 15 * 60, days: EVERY_DAY };
    // 14:00 local on the 27th: still to come today.
    expect(
      nextReminderAt(
        item,
        "Asia/Singapore",
        new Date("2026-10-27T06:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-10-27T07:00:00.000Z");
    // 16:00 local: tomorrow.
    expect(
      nextReminderAt(
        item,
        "Asia/Singapore",
        new Date("2026-10-27T08:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-10-28T07:00:00.000Z");
  });

  it("changing timezone changes the instant, not the wall-clock time", () => {
    const m = { minuteOfDay: 8 * 60, days: EVERY_DAY };
    const now = new Date("2026-10-27T12:00:00Z");
    expect(nextReminderAt(m, "Asia/Singapore", now)?.toISOString()).toBe(
      "2026-10-28T00:00:00.000Z",
    );
    expect(nextReminderAt(m, "Europe/London", now)?.toISOString()).toBe(
      "2026-10-28T08:00:00.000Z",
    );
  });

  it("quiet hours stop a reminder that falls inside them", () => {
    expect(inQuietHours(8 * 60, 22 * 60, 8 * 60)).toBe(false);
    expect(inQuietHours(7 * 60 + 59, 22 * 60, 8 * 60)).toBe(true);
    expect(inQuietHours(23 * 60, 22 * 60, 8 * 60)).toBe(true);
  });
});

describe("the nudge budget", () => {
  it("Koe's morning nudge is capped by nudgesPerDay", () => {
    expect(canSendKoeNudge(1, 0)).toBe(true);
    expect(canSendKoeNudge(1, 1)).toBe(false);
    expect(canSendKoeNudge(2, 1)).toBe(true);
    expect(canSendKoeNudge(0, 0)).toBe(false);
  });

  it("only one-off item reminders fire once", () => {
    expect(remindsOnce("item", null)).toBe(true);
    expect(remindsOnce("item", [])).toBe(true);
    expect(remindsOnce("item", [1, 3])).toBe(false);
    expect(remindsOnce("morning_plan", null)).toBe(false);
  });
});

describe("lock-screen text", () => {
  it("is neutral and names no entry", () => {
    expect(reminderPayload("morning_plan", 480).body).toBe(
      "Your day is ready.",
    );
    expect(reminderPayload("item", 15 * 60)).toEqual({
      title: "Koe",
      body: "A reminder for 15:00.",
      url: "/today",
    });
  });
});

describe("calendar file", () => {
  const item = (over = {}) => ({
    id: "s1",
    day: "2026-10-24",
    minuteOfDay: 15 * 60,
    title: "Put on one song",
    why: "Because music has helped before",
    size: "tiny" as const,
    ...over,
  });

  it("escapes commas, semicolons, backslashes and new lines", () => {
    expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });

  it("writes UTC times that follow the person's own zone", () => {
    const now = new Date("2026-10-24T01:00:00Z");
    // London on 24 Oct is still on summer time: 15:00 local is 14:00Z.
    const london = buildCalendar([item()], "Europe/London", now);
    expect(london).toContain("DTSTART:20261024T140000Z");
    expect(london).toContain("DTEND:20261024T141500Z");
    // After the change, 15:00 local is 15:00Z.
    expect(
      buildCalendar([item({ day: "2026-10-26" })], "Europe/London", now),
    ).toContain("DTSTART:20261026T150000Z");
    expect(buildCalendar([item()], "Asia/Singapore", now)).toContain(
      "DTSTART:20261024T070000Z",
    );
  });

  it("uses 15, 30 and 45 minutes for tiny, small and medium", () => {
    expect(durationMinutes("tiny")).toBe(15);
    expect(durationMinutes("small")).toBe(30);
    expect(durationMinutes("medium")).toBe(45);
    expect(durationMinutes(null)).toBe(30);
  });

  it("is a well-formed calendar with the title, why line and Koe", () => {
    const ics = buildCalendar(
      [item({ title: "Walk, then tea; slowly" })],
      "UTC",
      new Date("2026-10-24T01:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("SUMMARY:Walk\\, then tea\\; slowly");
    expect(ics).toContain(
      "DESCRIPTION:Because music has helped before\\nFrom Koe",
    );
    expect(ics).toContain("UID:s1-2026-10-24@koe.local");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    // Every line ends CRLF and none is a bare LF.
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const long = "SUMMARY:" + "é".repeat(80);
    const folded = foldLine(long);
    for (const part of folded.split("\r\n"))
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").join("").replace(/ /g, "")).toBe(long);
  });
});
