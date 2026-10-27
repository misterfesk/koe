import "server-only";
import { headers } from "next/headers";
import { uses12Hour } from "@/domain/time";
import { subscriptionsFor } from "./data/reminders";
import { env } from "./env";
import { pushConfigured } from "./push";
import type { Viewer } from "./viewer";

/** What the Talk screen needs beyond the messages: the person's clock and reminder state. */
export async function talkScreenState(v: Viewer) {
  const [accept, subs] = await Promise.all([
    headers(),
    subscriptionsFor(v.db, [v.user.id]),
  ]);
  return {
    hour12: uses12Hour(accept.get("accept-language")),
    push: {
      publicKey: pushConfigured() ? (env().VAPID_PUBLIC_KEY ?? "stub") : null,
      subscribed: subs.length > 0,
    },
  };
}
