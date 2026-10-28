import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  emptyModel,
  intakeModel,
  storedModel,
  type IntakeModel,
} from "@/domain/intake";
import type { DayItem } from "@/domain/day-plan";
import { kindAreas, planItemSchema, type PlanItem } from "@/domain/plan-menu";
import type { Db } from "../db";
import {
  memoryCard,
  person,
  planDay,
  profile,
  step,
  userModel,
} from "../db/schema";
import { open, seal } from "../crypto";
import { insertStep } from "./steps";

// What Koe knows about a person (user_model) and the days it planned
// (plan_day). Both are sealed JSON; the shapes live in domain/.

export type UserModelView = {
  model: IntakeModel;
  summary: string;
  version: number;
  updatedAt: string;
};

export async function getUserModel(
  db: Db,
  userId: string,
): Promise<UserModelView | null> {
  const [row] = await db
    .select()
    .from(userModel)
    .where(eq(userModel.userId, userId));
  if (!row) return null;
  const parsed = storedModel.safeParse(JSON.parse(open(row.dataEnc)));
  return {
    // An unreadable older shape degrades to "knows nothing", never an error.
    model: parsed.success ? intakeModel.parse(parsed.data) : emptyModel(),
    summary: open(row.summaryEnc),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const snapshot = z.object({
  items: z.array(
    planItemSchema.extend({
      // The person's own title may be shorter than a generated suggestion.
      title: z.string().trim().min(1).max(80),
      stepId: z.string().optional(),
      problem: z.string().optional(),
    }),
  ),
});

export type PlanDayItem = DayItem;
export type PlanDayView = {
  id: string;
  day: string;
  energy: "low" | "okay" | "more" | null;
  mode: "normal" | "lighter";
  version: number;
  items: PlanDayItem[];
  /** Why this version was written, and Koe's one line about it. */
  reason: string | null;
  note: string | null;
  createdAt: string;
};

function toView(r: typeof planDay.$inferSelect): PlanDayView {
  const parsed = snapshot.safeParse(JSON.parse(open(r.snapshotEnc)));
  return {
    id: r.id,
    day: r.day,
    energy: r.energy,
    mode: r.mode,
    version: r.version,
    items: parsed.success ? parsed.data.items : [],
    reason: r.reason,
    note: r.noteEnc ? open(r.noteEnc) : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The newest version of one day's plan. */
export async function getPlanDay(db: Db, userId: string, day: string) {
  const [row] = await db
    .select()
    .from(planDay)
    .where(and(eq(planDay.userId, userId), eq(planDay.day, day)))
    .orderBy(desc(planDay.version))
    .limit(1);
  return row ? toView(row) : null;
}

export async function listPlanDays(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(planDay)
    .where(eq(planDay.userId, userId))
    .orderBy(desc(planDay.day), desc(planDay.version));
  return rows.map(toView);
}

/** The person edits the summary Koe holds about them; sealed like the rest. */
export async function saveSummary(db: Db, userId: string, summary: string) {
  const rows = await db
    .update(userModel)
    .set({
      summaryEnc: seal(summary),
      version: sql`${userModel.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(userModel.userId, userId))
    .returning({ id: userModel.userId });
  return rows.length > 0;
}

/** Compare-and-save prevents an old tab overwriting newer saved information. */
export async function saveUserModel(
  db: Db,
  userId: string,
  version: number,
  model: IntakeModel,
  summary: string,
) {
  const values = {
    dataEnc: seal(JSON.stringify({ ...model, v: 1 })),
    summaryEnc: seal(summary),
    updatedAt: new Date(),
  };
  const rows =
    version === 0
      ? await db
          .insert(userModel)
          .values({ userId, ...values })
          .onConflictDoNothing()
          .returning({ version: userModel.version })
      : await db
          .update(userModel)
          .set({ ...values, version: sql`${userModel.version} + 1` })
          .where(
            and(eq(userModel.userId, userId), eq(userModel.version, version)),
          )
          .returning({ version: userModel.version });
  return rows[0]?.version ?? null;
}

export async function hasIntro(db: Db, userId: string) {
  const [model] = await db
    .select({ id: userModel.userId })
    .from(userModel)
    .where(eq(userModel.userId, userId));
  if (model) return true;
  // Memory off keeps no model, but the intro's steps are marked as its own.
  const [first] = await db
    .select({ id: step.id })
    .from(step)
    .where(and(eq(step.userId, userId), eq(step.origin, "intro")))
    .limit(1);
  return !!first;
}

export type IntroCommit = {
  model: IntakeModel;
  summary: string;
  /** Only the memory cards the person approved. */
  memories: {
    kind: "helps" | "hard" | "people" | "preference";
    text: string;
  }[];
  /** Names the person ticked "save to my people" for. */
  people: string[];
  items: PlanItem[];
  /** Memory off: nothing about the person is remembered, only the day. */
  memoryOn: boolean;
  today: string;
};

/**
 * "Start my day": writes exactly what the person approved, in one
 * transaction. The plan_day row goes first and is unique per user, day and
 * version, so a double tap or a retry writes nothing the second time.
 */
export async function commitIntro(db: Db, userId: string, c: IntroCommit) {
  return db.transaction(async (tx) => {
    const ids = c.items.map(() => crypto.randomUUID());
    // Someone who skipped the intro and opened Today already has a plan for
    // today. The intro's plan replaces it as the next version.
    const [latest] = await tx
      .select()
      .from(planDay)
      .where(and(eq(planDay.userId, userId), eq(planDay.day, c.today)))
      .orderBy(desc(planDay.version))
      .limit(1);
    if (latest) {
      const [done] = await tx
        .select({ id: step.id })
        .from(step)
        .where(and(eq(step.userId, userId), eq(step.origin, "intro")))
        .limit(1);
      if (done) return { already: true as const };
      const old = toView(latest).items.flatMap((i) =>
        i.stepId ? [i.stepId] : [],
      );
      if (old.length)
        await tx
          .update(step)
          .set({ status: "archived", updatedAt: new Date() })
          .where(and(eq(step.userId, userId), inArray(step.id, old)));
    }
    const planned = await tx
      .insert(planDay)
      .values({
        userId,
        day: c.today,
        mode: "normal",
        version: (latest?.version ?? 0) + 1,
        reason: "intro",
        snapshotEnc: seal(
          JSON.stringify({
            items: c.items.map((it, i) => ({ ...it, stepId: ids[i] })),
          }),
        ),
      })
      .onConflictDoNothing()
      .returning({ id: planDay.id });
    if (!planned.length) return { already: true as const };

    // The tone they chose is a setting, not a memory: it applies either way.
    if (c.model.tone)
      await tx
        .update(profile)
        .set({ tone: c.model.tone, updatedAt: new Date() })
        .where(eq(profile.userId, userId));

    if (c.memoryOn) {
      await tx
        .insert(userModel)
        .values({
          userId,
          dataEnc: seal(JSON.stringify({ ...c.model, v: 1 })),
          summaryEnc: seal(c.summary),
        })
        .onConflictDoUpdate({
          target: userModel.userId,
          set: {
            dataEnc: seal(JSON.stringify({ ...c.model, v: 1 })),
            summaryEnc: seal(c.summary),
            version: sql`${userModel.version} + 1`,
            updatedAt: new Date(),
          },
        });
      for (const m of c.memories)
        await tx.insert(memoryCard).values({
          userId,
          kind: m.kind,
          textEnc: seal(m.text),
          source: "intro",
        });
    }

    if (c.people.length) {
      const known = new Set(
        (await tx.select().from(person).where(eq(person.userId, userId))).map(
          (p) => open(p.nameEnc).trim().toLowerCase(),
        ),
      );
      for (const name of c.people) {
        if (known.has(name.trim().toLowerCase())) continue;
        known.add(name.trim().toLowerCase());
        await tx
          .insert(person)
          .values({ userId, nameEnc: seal(name), channel: "message" });
      }
    }

    for (const [i, item] of c.items.entries())
      await insertStep(
        tx,
        userId,
        {
          id: ids[i],
          area: kindAreas[item.kind],
          title: item.title,
          why: item.why,
          kind: item.kind,
          minuteOfDay: item.minuteOfDay,
          size: item.size,
          origin: "intro",
          when: "today",
        },
        c.today,
      );
    return { already: false as const };
  });
}
