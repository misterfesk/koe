import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { checkIn, movableTables, profile, weeklyReview } from "./schema";

/**
 * Moves everything a guest created onto the account they just signed up or
 * signed in with, so nothing is lost when a guest makes an account. If the
 * account already has a profile, the account's settings win and the guest's
 * profile is dropped; every other record is carried over.
 */
export async function transferOwnership(db: Db, from: string, to: string) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(profile)
      .where(eq(profile.userId, to));
    const [guest] = await tx
      .select()
      .from(profile)
      .where(eq(profile.userId, from));
    if (existing) {
      // The account's settings win, except that a safety pause and the more
      // private choice are never lost by signing in.
      if (guest)
        await tx
          .update(profile)
          .set({
            coachingPausedAt:
              existing.coachingPausedAt ?? guest.coachingPausedAt,
            memoryOn: existing.memoryOn && guest.memoryOn,
            keepTranscripts: existing.keepTranscripts && guest.keepTranscripts,
          })
          .where(eq(profile.userId, to));
      await tx.delete(profile).where(eq(profile.userId, from));
    } else {
      await tx
        .update(profile)
        .set({ userId: to })
        .where(eq(profile.userId, from));
    }
    // One check-in per day and one look-back per week: the account's own
    // entry wins on a clash.
    await tx
      .delete(checkIn)
      .where(
        and(
          eq(checkIn.userId, from),
          sql`${checkIn.day} in (select "day" from "check_in" where "user_id" = ${to})`,
        ),
      );
    await tx
      .delete(weeklyReview)
      .where(
        and(
          eq(weeklyReview.userId, from),
          sql`${weeklyReview.weekStart} in (select "week_start" from "weekly_review" where "user_id" = ${to})`,
        ),
      );
    for (const table of movableTables) {
      await tx.execute(
        sql`update ${table} set "user_id" = ${to} where "user_id" = ${from}`,
      );
    }
  });
}
