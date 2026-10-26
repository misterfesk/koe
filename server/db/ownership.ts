import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { profile, safetyEvent } from "./schema";

/**
 * Moves everything a guest created onto the account they just signed up or
 * signed in with, so nothing is lost when a guest makes an account. If the
 * account already has a profile, the account's settings win and the guest's
 * profile is dropped; every other record is carried over.
 */
export async function transferOwnership(db: Db, from: string, to: string) {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ userId: profile.userId })
      .from(profile)
      .where(eq(profile.userId, to));
    if (existing.length) {
      await tx.delete(profile).where(eq(profile.userId, from));
    } else {
      await tx
        .update(profile)
        .set({ userId: to })
        .where(eq(profile.userId, from));
    }
    await tx
      .update(safetyEvent)
      .set({ userId: to })
      .where(eq(safetyEvent.userId, from));
  });
}
