import "server-only";
import { emptyModel } from "@/domain/intake";
import type { VetContext } from "@/domain/talk-tools";
import { getCheckIn } from "../data/profile";
import { getPlanDay, getUserModel } from "../data/intake";
import { listMemory } from "../data/memory";
import { todayReports } from "../data/plan";
import { listPeople } from "../data/people";
import { env } from "../env";
import { pushConfigured } from "../push";
import type { Viewer } from "../viewer";
import { buildContext } from "./context";
import { talkPacket, type TalkContext, type TalkPacket } from "./talk";

/**
 * Everything Talk knows for one turn: the context packet the model reads and
 * the facts the tool checks run against (today's plan with ids, the people in
 * the person's corner, the cards already kept). With memory off, the model
 * gets no titles, names or cards; the checks still see them so a card can
 * name what it is about.
 */
export async function buildTalkContext(
  v: Viewer,
  turn: number,
): Promise<TalkContext> {
  const memoryOn = v.profile.memoryOn;
  const uid = v.user.id;
  const [packet, plan, reports, people, view, cards, energy] =
    await Promise.all([
      buildContext(v.db, uid, v.today),
      getPlanDay(v.db, uid, v.today),
      todayReports(v.db, uid, v.today),
      listPeople(v.db, uid),
      memoryOn ? getUserModel(v.db, uid) : Promise.resolve(null),
      memoryOn ? listMemory(v.db, uid) : Promise.resolve([]),
      memoryOn ? getCheckIn(v.db, uid, v.today) : Promise.resolve(null),
    ]);
  const vet: VetContext = {
    items: (plan?.items ?? []).flatMap((i) =>
      i.stepId
        ? [
            {
              ...i,
              stepId: i.stepId,
              done:
                reports.get(i.stepId)?.outcome === "done" ||
                reports.get(i.stepId)?.outcome === "partly",
            },
          ]
        : [],
    ),
    people: people.map((p) => ({ id: p.id, name: p.name, channel: p.channel })),
    model: view?.model ?? emptyModel(),
    memoryOn,
    memories: cards.map((c) => c.text),
    planMode: plan?.mode ?? "normal",
  };
  return {
    packet: talkPacket(packet as unknown as TalkPacket, {
      energy,
      people: memoryOn ? people : [],
    }),
    turn,
    vet,
    canRemind: pushConfigured(),
    canSearch: env().KOE_SEARCH !== "off",
  };
}
