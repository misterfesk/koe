import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { checkIn, profile, safetyEvent } from "../db/schema";
import type { Energy } from "@/domain/steps";

export type ProfileSettings = Partial<
  Pick<
    typeof profile.$inferInsert,
    | "region"
    | "timezone"
    | "memoryOn"
    | "keepTranscripts"
    | "nudgesPerDay"
    | "quietStart"
    | "quietEnd"
    | "tone"
    | "plain"
    | "reducedMotion"
    | "sceneStyle"
    | "mascot"
    | "coachingPausedAt"
    | "lastSeenAt"
    | "dismissedPatterns"
  >
>;

/** Creates or completes the profile at the end of the one-screen setup. */
export async function completeSetup(
  db: Db,
  userId: string,
  setup: { region: string; timezone: string },
) {
  const now = new Date();
  await db
    .insert(profile)
    .values({
      userId,
      ...setup,
      adultAttestedAt: now,
      onboardedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { ...setup, adultAttestedAt: now, onboardedAt: now, updatedAt: now },
    });
}

export async function updateProfile(
  db: Db,
  userId: string,
  settings: ProfileSettings,
) {
  await db
    .update(profile)
    .set({ ...settings, updatedAt: new Date() })
    .where(eq(profile.userId, userId));
}

export async function getCheckIn(db: Db, userId: string, day: string) {
  const [row] = await db
    .select()
    .from(checkIn)
    .where(and(eq(checkIn.userId, userId), eq(checkIn.day, day)));
  return row?.energy ?? null;
}

export async function setCheckIn(
  db: Db,
  userId: string,
  day: string,
  energy: Energy | null,
) {
  if (!energy) {
    await db
      .delete(checkIn)
      .where(and(eq(checkIn.userId, userId), eq(checkIn.day, day)));
    return;
  }
  await db
    .insert(checkIn)
    .values({ userId, day, energy })
    .onConflictDoUpdate({
      target: [checkIn.userId, checkIn.day],
      set: { energy },
    });
}

export async function recordSafetyEvent(
  db: Db,
  userId: string,
  event: Pick<typeof safetyEvent.$inferInsert, "level" | "source" | "surface">,
) {
  await db.insert(safetyEvent).values({ userId, ...event });
}
