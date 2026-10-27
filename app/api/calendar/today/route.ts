import { buildCalendar, type IcsItem } from "@/domain/ics";
import { getPlanDay } from "@/server/data/intake";
import { listSteps } from "@/server/data/steps";
import { getViewer } from "@/server/viewer";

/** Today's plan as a calendar file: only the person's own entries that have a time. */
export async function GET() {
  const v = await getViewer();
  if (!v?.profile) return new Response("Not signed in", { status: 401 });
  const [plan, steps] = await Promise.all([
    getPlanDay(v.db, v.user.id, v.today),
    listSteps(v.db, v.user.id),
  ]);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const items: IcsItem[] = (plan?.items ?? []).flatMap((i) => {
    const s = i.stepId ? byId.get(i.stepId) : undefined;
    if (!s || s.minuteOfDay === null) return [];
    if (s.status !== "active" && s.status !== "finished") return [];
    return [
      {
        id: s.id,
        day: v.today,
        minuteOfDay: s.minuteOfDay,
        title: s.title,
        size: s.size,
      },
    ];
  });
  if (!items.length)
    return new Response("Nothing with a time is planned for today.", {
      status: 404,
    });
  return new Response(buildCalendar(items, v.profile.timezone), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="koe-today.ics"',
      "cache-control": "private, no-store",
    },
  });
}
