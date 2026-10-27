import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  describeDays,
  localDay,
  localMinutes,
  readableDay,
  weekStart,
  weekday,
} from "@/domain/time";
import { inQuietHours, nextReminderAt, zonedInstant } from "@/domain/reminders";
import { telHref } from "@/fixtures/help-resources";

describe("calendar days", () => {
  it("uses the person's own timezone for today", () => {
    const at = new Date("2026-10-26T20:30:00Z");
    expect(localDay("Asia/Singapore", at)).toBe("2026-10-27");
    expect(localDay("America/New_York", at)).toBe("2026-10-26");
    expect(localMinutes("Asia/Singapore", at)).toBe(4 * 60 + 30);
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(localDay("Not/AZone", new Date("2026-01-01T23:00:00Z"))).toBe(
      "2026-01-01",
    );
  });

  it("does day arithmetic without timezone drift", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-10-20", "2026-10-27")).toBe(7);
    expect(weekday("2026-10-26")).toBe(1); // Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday → Monday
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });

  it("describes repeat days in plain words, Monday first", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([5, 1, 3, 2, 4])).toBe("Weekdays");
    expect(describeDays([6, 0])).toBe("Weekends");
    expect(describeDays([0, 3, 1])).toBe("Mon, Wed, Sun");
  });

  it("reads nearby days as words", () => {
    expect(readableDay("2026-10-26", "2026-10-26")).toBe("Today");
    expect(readableDay("2026-10-25", "2026-10-26")).toBe("Yesterday");
    expect(readableDay("2026-10-27", "2026-10-26")).toBe("Tomorrow");
  });
});

describe("reminder times", () => {
  it("converts a local wall-clock time to the right instant", () => {
    expect(
      zonedInstant("Asia/Singapore", "2026-10-27", 600).toISOString(),
    ).toBe("2026-10-27T02:00:00.000Z");
    // London: summer time (UTC+1) ends on 25 October 2026.
    expect(zonedInstant("Europe/London", "2026-10-24", 600).toISOString()).toBe(
      "2026-10-24T09:00:00.000Z",
    );
    expect(zonedInstant("Europe/London", "2026-10-26", 600).toISOString()).toBe(
      "2026-10-26T10:00:00.000Z",
    );
  });

  it("finds the next chosen weekday after now", () => {
    const now = new Date("2026-10-26T03:00:00Z"); // Mon 11:00 in Singapore
    const next = nextReminderAt(
      { minuteOfDay: 600, days: [1, 3] },
      "Asia/Singapore",
      now,
    );
    expect(next?.toISOString()).toBe("2026-10-28T02:00:00.000Z"); // Wed 10:00
    expect(
      nextReminderAt(
        { minuteOfDay: 720, days: [1] },
        "Asia/Singapore",
        now,
      )?.toISOString(),
    ).toBe("2026-10-26T04:00:00.000Z"); // later today
    expect(
      nextReminderAt({ minuteOfDay: 600, days: [] }, "UTC", now),
    ).toBeNull();
  });

  it("handles quiet hours that cross midnight", () => {
    expect(inQuietHours(23 * 60, 22 * 60, 8 * 60)).toBe(true);
    expect(inQuietHours(7 * 60, 22 * 60, 8 * 60)).toBe(true);
    expect(inQuietHours(12 * 60, 22 * 60, 8 * 60)).toBe(false);
    expect(inQuietHours(13 * 60, 12 * 60, 14 * 60)).toBe(true);
    expect(inQuietHours(13 * 60, 0, 0)).toBe(false);
  });
});

describe("tap-to-call links", () => {
  it("dials the first number in a listing", () => {
    expect(telHref("988")).toBe("tel:988");
    expect(telHref("116 123")).toBe("tel:116123");
    expect(telHref("9-8-8")).toBe("tel:988");
    expect(telHref("999 or 112")).toBe("tel:999");
    expect(telHref("10177 (ambulance) or 112 from a mobile phone")).toBe(
      "tel:10177",
    );
    expect(telHref("+880 9612-119911")).toBe("tel:+8809612119911");
  });
});
