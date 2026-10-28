import "server-only";
import { emptyModel } from "@/domain/intake";
import type { VetContext } from "@/domain/talk-tools";
import { getCheckIn } from "../data/profile";
import { getPlanDay, getUserModel } from "../data/intake";
import { listMemory } from "../data/memory";
import { todayReports } from "../data/plan";
import { listPeople } from "../data/people";
import { thingState, weekThingStates, type ThingState } from "../data/week";
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
 *
 * `thisWeek` lists the things of the newest week (title, when, state, so a
 * finished one reads "done"); with memory off it is only the count still open. `focus` is the thing the person
 * opened Talk from: with memory off it carries only its state, because
 * memory off sends the model no titles and none of the person's own words.
 */
export async function buildTalkContext(
  v: Viewer,
  turn: number,
  focus?: ThingState | null,
): Promise<TalkContext> {
  const memoryOn = v.profile.memoryOn;
  const uid = v.user.id;
  const [packet, plan, reports, people, view, cards, energy, things] =
    await Promise.all([
      buildContext(v.db, uid, v.today),
      getPlanDay(v.db, uid, v.today),
      todayReports(v.db, uid, v.today),
      listPeople(v.db, uid),
      memoryOn ? getUserModel(v.db, uid) : Promise.resolve(null),
      memoryOn ? listMemory(v.db, uid) : Promise.resolve([]),
      memoryOn ? getCheckIn(v.db, uid, v.today) : Promise.resolve(null),
      weekThingStates(v.db, uid, v.today),
    ]);
  const open = things.filter((t) => !t.done);
  const thisWeek = memoryOn
    ? things.map((t) => ({
        title: t.title,
        when: t.when,
        state: thingState(t),
      }))
    : { openThings: open.length };
  const focused = focus
    ? memoryOn
      ? {
          title: focus.title,
          what: focus.what,
          when: focus.when,
          state: thingState(focus),
        }
      : { state: thingState(focus) }
    : null;
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
  const talk = talkPacket(packet as unknown as TalkPacket, {
    energy,
    people: memoryOn ? people : [],
  });
  // So the model knows which entries are This week things (never shrunk).
  const weekly = new Set(
    (plan?.items ?? []).flatMap((i) =>
      i.weekItemId && i.stepId ? [i.stepId] : [],
    ),
  );
  if (talk.today)
    talk.today = {
      ...talk.today,
      items: talk.today.items.map((i) =>
        i.id && weekly.has(i.id) ? { ...i, thisWeek: true } : i,
      ),
    };
  return {
    packet: {
      ...talk,
      thisWeek,
      ...(focused ? { focus: focused } : {}),
    },
    turn,
    vet,
    canRemind: pushConfigured(),
    canSearch: env().KOE_SEARCH !== "off",
  };
}
