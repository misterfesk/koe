import { daysBetween, localDay } from "@/domain/time";
import { updateProfile } from "@/server/data/profile";
import { requireViewer } from "@/server/viewer";

// Everything here is personal, so it is never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const v = await requireViewer();
  const last = v.profile.lastSeenAt;
  // After a week away, Today offers a fresh start and keeps lastSeenAt until
  // the person answers. Otherwise note the visit at most once an hour.
  const away =
    last && daysBetween(localDay(v.profile.timezone, last), v.today) >= 7;
  if (!away && (!last || Date.now() - last.getTime() > 3600_000))
    await updateProfile(v.db, v.user.id, { lastSeenAt: new Date() });
  return children;
}
