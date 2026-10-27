import { buildCalendar } from "@/domain/ics";
import { getStep } from "@/server/data/steps";
import { getViewer } from "@/server/viewer";

/** One entry as a calendar file. Only the person's own entries, and only with a time. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const v = await getViewer();
  if (!v?.profile) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const s = id.length <= 64 ? await getStep(v.db, v.user.id, id) : null;
  if (!s || s.minuteOfDay === null)
    return new Response("That entry has no time to add.", { status: 404 });
  const body = buildCalendar(
    [
      {
        id: s.id,
        day: s.plannedFor ?? v.today,
        minuteOfDay: s.minuteOfDay,
        title: s.title,
        size: s.size,
      },
    ],
    v.profile.timezone,
  );
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="koe-reminder.ics"',
      "cache-control": "private, no-store",
    },
  });
}
