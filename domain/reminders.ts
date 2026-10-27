import { isValidTimeZone } from "./time";

// Reminders the person set themselves: a local time on chosen weekdays.
// Times are computed in the person's own timezone, across daylight saving.

/** Offset of `timeZone` from UTC at `at`, in minutes (e.g. +480 for Singapore). */
function offsetMinutes(timeZone: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of a local wall-clock time on a local day. */
export function zonedInstant(timeZone: string, day: string, minute: number) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  let at = new Date(guess - offsetMinutes(timeZone, new Date(guess)) * 60000);
  // Second pass settles days when the offset changes (daylight saving).
  at = new Date(guess - offsetMinutes(timeZone, at) * 60000);
  return at;
}

export function inQuietHours(minute: number, start: number, end: number) {
  if (start === end) return false;
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

/** The next time strictly after `now` that this reminder should fire. */
export function nextReminderAt(
  r: { minuteOfDay: number; days: number[] },
  timeZone: string,
  now: Date,
): Date | null {
  if (!r.days.length) return null;
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
    now,
  );
  for (let i = 0; i < 8; i++) {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    if (!r.days.includes(d.getUTCDay())) continue;
    const at = zonedInstant(zone, day, r.minuteOfDay);
    if (at.getTime() > now.getTime()) return at;
  }
  return null;
}

/** After this many reminders in a row with no answer, Koe pauses them. */
export const IGNORE_LIMIT = 3;
