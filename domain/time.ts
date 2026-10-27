// Calendar days are "YYYY-MM-DD" strings in the person's own timezone.
// Arithmetic on them runs in UTC so it never shifts across daylight saving.

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parts(timeZone: string, at: Date) {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return values as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

export function localDay(timeZone: string, at = new Date()) {
  const p = parts(timeZone, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes after local midnight. */
export function localMinutes(timeZone: string, at = new Date()) {
  const p = parts(timeZone, at);
  return Number(p.hour) * 60 + Number(p.minute);
}

function toUtc(day: string) {
  return new Date(day + "T00:00:00Z");
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string) {
  return toUtc(day).getUTCDay();
}

export function addDays(day: string, n: number) {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Weeks start on Monday. */
export function weekStart(day: string) {
  return addDays(day, -((weekday(day) + 6) % 7));
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeDays(days: number[]) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  // Show Monday first.
  return set
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => weekdayNames[d])
    .join(", ");
}

export const weekdayOptions = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
  value: d,
  label: weekdayNames[d],
}));

export function readableDay(day: string, today: string) {
  const diff = daysBetween(day, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return toUtc(day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
