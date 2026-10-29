import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "../db";

/** Guests with no activity for this many days are deleted. */
export const GUEST_IDLE_DAYS = 14;

/**
 * Deletes guest (anonymous) people who have been idle for GUEST_IDLE_DAYS:
 * no session used and no AI or search call in that time. Everything they made
 * goes with them (rows cascade). People with an account are never touched.
 */
export async function purgeIdleGuests(db: Db) {
  await db.execute(sql`
    delete from "user" u
    where u."is_anonymous" = true
      and u."created_at" < now() - make_interval(days => ${GUEST_IDLE_DAYS})
      and not exists (
        select 1 from "session" s
        where s."user_id" = u."id"
          and s."updated_at" >= now() - make_interval(days => ${GUEST_IDLE_DAYS})
      )
      and not exists (
        select 1 from "agent_run" r
        where r."user_id" = u."id"
          and r."created_at" >= now() - make_interval(days => ${GUEST_IDLE_DAYS})
      )
  `);
}
