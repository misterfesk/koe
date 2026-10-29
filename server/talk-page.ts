import "server-only";
import { headers } from "next/headers";
import { uses12Hour } from "@/domain/time";
import { subscriptionsFor } from "./data/reminders";
import { keptFrom, type getConversation } from "./data/talk";
import { taskFocus } from "./data/week";
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

export type TakeawayView = { text: string; kept: boolean };

/**
 * The thing a conversation was opened from (by its current title) and its
 * takeaways, marked when already kept. Memory off shows no takeaways.
 */
export async function conversationExtras(
  v: Viewer,
  convo: NonNullable<Awaited<ReturnType<typeof getConversation>>>,
) {
  const thing = convo.context
    ? await taskFocus(v.db, v.user.id, convo.context, v.today)
    : null;
  const kept =
    v.profile.memoryOn && convo.takeaways.length
      ? await keptFrom(v.db, v.user.id, convo.id)
      : new Set<string>();
  return {
    focus: thing ? { title: thing.title } : null,
    takeaways: v.profile.memoryOn
      ? convo.takeaways.map((text): TakeawayView => ({
          text,
          kept: kept.has(text),
        }))
      : [],
  };
}
