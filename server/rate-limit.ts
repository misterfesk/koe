import "server-only";
import { headers } from "next/headers";

// Simple fixed-window limits kept in memory. Fine for one server; several
// instances need a shared store (for example Postgres or Redis).
const windows = new Map<string, { start: number; count: number }>();

function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000)
      for (const [k, v] of windows)
        if (now - v.start > windowMs) windows.delete(k);
    return true;
  }
  w.count++;
  return w.count <= limit;
}

/** Trusts proxy headers: when hosting, put Koe behind a proxy that sets them. */
export async function clientIp() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}

/** False when this caller has used up the allowance for `action`. */
export async function allow(
  action: "sign-in" | "sign-up" | "guest" | "reminder-test",
  extraKey?: string,
) {
  // The e2e suite starts dozens of guests from one machine.
  if (process.env.KOE_RATE_LIMIT === "off") return true;
  const ip = await clientIp();
  const rules = {
    "sign-in": { limit: 10, windowMs: 10 * 60_000 },
    "sign-up": { limit: 5, windowMs: 60 * 60_000 },
    guest: { limit: 20, windowMs: 60 * 60_000 },
    "reminder-test": { limit: 5, windowMs: 60_000 },
  }[action];
  // A test notification is limited per person, not per network address.
  const byIp =
    action === "reminder-test"
      ? true
      : hit(`${action}:ip:${ip}`, rules.limit, rules.windowMs);
  const byKey = extraKey
    ? hit(
        `${action}:key:${extraKey.toLowerCase()}`,
        rules.limit,
        rules.windowMs,
      )
    : true;
  return byIp && byKey;
}
