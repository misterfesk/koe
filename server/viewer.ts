import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { localDay } from "@/domain/time";
import { currentUser } from "./auth";
import { db } from "./db";
import { profile } from "./db/schema";

export type Profile = typeof profile.$inferSelect;

/** The person using Koe on this request, with their settings. Cached per request. */
export const getViewer = cache(async () => {
  const user = await currentUser();
  if (!user) return null;
  const database = await db();
  const [row] = await database
    .select()
    .from(profile)
    .where(eq(profile.userId, user.id));
  return {
    user,
    profile: row ?? null,
    db: database,
    today: localDay(row?.timezone ?? "UTC"),
    isGuest: !!user.isAnonymous,
  };
});

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>> & {
  profile: Profile;
};

/** For app pages and actions: a signed-in person who has finished setup. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.profile?.onboardedAt) redirect("/start");
  return viewer as Viewer;
}
