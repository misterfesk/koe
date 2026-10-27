import { zonedInstant } from "./reminders";
import type { PlanSize } from "./plan-menu";

// A calendar file (RFC 5545) for items that have a time. Times are written
// in UTC with a trailing Z, so no VTIMEZONE block is needed and every
// calendar app converts them to the person's own zone the same way.

export type IcsItem = {
  /** Stable id for the entry; the same entry on the same day updates, not duplicates. */
  id: string;
  /** Local day, YYYY-MM-DD. */
  day: string;
  minuteOfDay: number;
  title: string;
  why: string | null;
  size: PlanSize | null;
};

export const durationMinutes = (size: PlanSize | null) =>
  size === "tiny" ? 15 : size === "medium" ? 45 : 30;

/** TEXT values: backslash, semicolon, comma and line breaks are escaped. */
export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space. */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildCalendar(
  items: IcsItem[],
  timeZone: string,
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Koe//Your day//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const it of items) {
    const start = zonedInstant(timeZone, it.day, it.minuteOfDay);
    const end = new Date(start.getTime() + durationMinutes(it.size) * 60_000);
    const description = [it.why, "From Koe"].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.id}-${it.day}@koe.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(it.title)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
