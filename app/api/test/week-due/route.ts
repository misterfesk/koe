import { addDays } from "@/domain/time";
import { saveWeek } from "@/server/data/week";
import { isLocalHost } from "@/server/local-only";
import { talkStubbed } from "@/server/llm/talk-stub";
import { getViewer } from "@/server/viewer";

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * Test builds only (the AI stub guard, like Today's ?scene=): gives the
 * signed-in person a two-thing week that started 7 days ago, so its review is
 * due today. Anywhere else it answers 404.
 */
export async function POST(request: Request) {
  if (!talkStubbed() || !isLocalHost(request.headers.get("host")))
    return notFound();
  const v = await getViewer();
  if (!v?.profile?.onboardedAt) return notFound();
  const thing = (title: string) => ({
    captured: { what: title, when: "", title },
  });
  const week = await saveWeek(v.db, v.user.id, {
    draft: { items: [thing("Email the landlord"), thing("Repot the plants")] },
    today: addDays(v.today, -7),
    eatingConcern: false,
  });
  return Response.json(
    { id: week.id },
    { headers: { "cache-control": "no-store" } },
  );
}
