import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { person, reachOut } from "../db/schema";
import { open, seal } from "../crypto";

export type Channel = "message" | "call" | "email" | "in_person";
export type ReachStatus =
  "draft" | "sent" | "replied" | "no_reply" | "not_sent";

export type PersonView = { id: string; name: string; channel: Channel };
export type ReachOutView = {
  id: string;
  personId: string | null;
  draft: string;
  status: ReachStatus;
  createdAt: string;
  updatedAt: string;
};

export async function listPeople(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(person)
    .where(eq(person.userId, userId))
    .orderBy(person.createdAt);
  return rows.map((r): PersonView => ({
    id: r.id,
    name: open(r.nameEnc),
    channel: r.channel,
  }));
}

export async function addPerson(
  db: Db,
  userId: string,
  input: { name: string; channel: Channel },
) {
  const [row] = await db
    .insert(person)
    .values({ userId, nameEnc: seal(input.name), channel: input.channel })
    .returning({ id: person.id });
  return row.id;
}

export async function deletePerson(db: Db, userId: string, id: string) {
  await db
    .delete(person)
    .where(and(eq(person.userId, userId), eq(person.id, id)));
}

export async function listReachOuts(db: Db, userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(reachOut)
    .where(eq(reachOut.userId, userId))
    .orderBy(desc(reachOut.createdAt))
    .limit(limit);
  return rows.map((r): ReachOutView => ({
    id: r.id,
    personId: r.personId,
    draft: open(r.draftEnc),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function recordReachOut(
  db: Db,
  userId: string,
  input: { personId: string | null; draft: string; status: ReachStatus },
) {
  const [row] = await db
    .insert(reachOut)
    .values({
      userId,
      personId: input.personId,
      draftEnc: seal(input.draft),
      status: input.status,
    })
    .returning({ id: reachOut.id });
  return row.id;
}

export async function setReachStatus(
  db: Db,
  userId: string,
  id: string,
  status: ReachStatus,
) {
  await db
    .update(reachOut)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(reachOut.userId, userId), eq(reachOut.id, id)));
}
