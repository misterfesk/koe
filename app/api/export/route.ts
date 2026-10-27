import { listMemory } from "@/server/data/memory";
import {
  getWeeklyReview,
  listCheckIns,
  listNotes,
  listWeeklyReviews,
} from "@/server/data/notes";
import { listPeople, listReachOuts } from "@/server/data/people";
import { listReminders } from "@/server/data/reminders";
import { listSteps } from "@/server/data/steps";
import { getConversation, listConversations } from "@/server/data/talk";
import { getViewer } from "@/server/viewer";

/** One file with everything the person has in Koe, readable and decrypted. */
export async function GET() {
  const v = await getViewer();
  if (!v?.profile) return new Response("Not signed in", { status: 401 });
  const id = v.user.id;
  const talks = await listConversations(v.db, id, 10_000);
  const data = {
    exportedAt: new Date().toISOString(),
    format: "koe-export-1",
    account: {
      email: v.isGuest ? null : v.user.email,
      guest: v.isGuest,
      createdAt: v.user.createdAt,
    },
    settings: {
      region: v.profile.region,
      timezone: v.profile.timezone,
      memoryOn: v.profile.memoryOn,
      keepTranscripts: v.profile.keepTranscripts,
      tone: v.profile.tone,
      quietStart: v.profile.quietStart,
      quietEnd: v.profile.quietEnd,
    },
    steps: await listSteps(v.db, id),
    notes: await listNotes(v.db, id),
    checkIns: await listCheckIns(v.db, id),
    memoryCards: await listMemory(v.db, id),
    conversations: await Promise.all(
      talks.map((t) => getConversation(v.db, id, t.id)),
    ),
    weeklyLookBacks: await Promise.all(
      (await listWeeklyReviews(v.db, id)).map((w) =>
        getWeeklyReview(v.db, id, w.weekStart),
      ),
    ),
    people: await listPeople(v.db, id),
    reachOuts: await listReachOuts(v.db, id, 10_000),
    reminders: await listReminders(v.db, id),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="koe-export-${v.today}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
