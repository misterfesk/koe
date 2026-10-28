/** The greeting by the person's local hour: 5-11 morning, 12-16 afternoon, 17-21 evening. */
export function greetingFor(minuteOfDay: number, name?: string | null): string {
  const hour = Math.floor(minuteOfDay / 60);
  const base =
    hour >= 5 && hour < 12
      ? "Good morning"
      : hour >= 12 && hour < 17
        ? "Good afternoon"
        : hour >= 17 && hour < 22
          ? "Good evening"
          : "Hello";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}

/** "Wednesday 28 October", in the person's timezone. */
export function dateLine(timeZone: string, at = new Date()): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    zone = "UTC";
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "long",
      day: "numeric",
      month: "long",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** One line on how the day stands. */
export function stateLine(opts: {
  lighter: boolean;
  waiting: number;
  answered: number;
}): string {
  if (opts.lighter) return "A lighter day";
  if (opts.waiting === 0)
    return opts.answered > 0 ? "All done for today" : "Nothing planned yet";
  return opts.waiting === 1 ? "1 thing today" : `${opts.waiting} things today`;
}

/** Meta line for a This week thing; null when there is nothing to say. */
export function weekMeta(t: { done: boolean; partly: number }): string | null {
  if (t.done) return "Done";
  if (t.partly <= 0) return null;
  if (t.partly === 1) return "Moved forward once";
  if (t.partly === 2) return "Moved forward twice";
  return `Moved forward ${t.partly} times`;
}
