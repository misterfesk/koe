import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { cachedResourceOk, templateWhy, whyOk } from "@/domain/resource-screen";
import { resourceTagsSchema, type ResourceTags } from "@/domain/resources";
import { sourceForUrl } from "@/domain/sources";
import type { Db } from "../db";
import { shelfItem, shelfRefresh } from "../db/schema";
import { open, seal } from "../crypto";
import { env } from "../env";
import type { Viewer } from "../viewer";
import { getUserModel } from "./intake";
import { searchEnabled } from "../search/tavily";
import { requestedSearches } from "./talk";

export function shelfWeek(day: string) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(
    ((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export async function shelfContext(v: Viewer) {
  // Local safety survives memory-off; only approved enum tags leave this module.
  const model = (await getUserModel(v.db, v.user.id))?.model;
  return { eatingConcern: model?.eatingConcern ?? false, model };
}

export type ShelfPick = {
  id: string;
  title: string;
  url: string;
  host: string;
  sourceName: string;
  why: string;
};
export async function listShelfExport(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(shelfItem)
    .where(eq(shelfItem.userId, userId))
    .orderBy(desc(shelfItem.createdAt));
  return rows.map(({ whyEnc, ...r }) => ({ ...r, why: open(whyEnc) }));
}

/** Read-only: safe to await during page rendering; never calls a provider. */
export async function getShelf(v: Viewer) {
  const week = shelfWeek(v.today);
  const { eatingConcern } = await shelfContext(v);
  const rows = await listShelfExport(v.db, v.user.id);
  const picks = rows.flatMap((r) => {
    if (
      !cachedResourceOk(
        {
          title: r.title,
          url: r.url,
          host: r.host,
          adult: true,
          foodOrExercise: r.foodOrExercise,
          aiScreened: r.aiScreened,
        },
        eatingConcern,
        env().KOE_AI === "on",
      )
    )
      return [];
    let tags: ResourceTags;
    try {
      const [goal, interest, format, region] = r.tagsKey.split(":");
      tags = resourceTagsSchema.parse({
        goal,
        interest: interest || undefined,
        format: format || undefined,
        region,
      });
    } catch {
      return [];
    }
    return [
      {
        ...r,
        sourceName: sourceForUrl(r.url)!.name,
        why: whyOk(r.why, eatingConcern) ? r.why : templateWhy(tags),
      },
    ];
  });
  const view = (r: (typeof picks)[number]): ShelfPick => ({
    id: r.id,
    title: r.title,
    url: r.url,
    host: r.host,
    sourceName: r.sourceName,
    why: r.why,
  });
  const [attempt] = await v.db
    .select()
    .from(shelfRefresh)
    .where(
      and(
        eq(shelfRefresh.userId, v.user.id),
        eq(shelfRefresh.requestKey, `week:${week}`),
      ),
    );
  const enabled = searchEnabled() && !v.profile.coachingPausedAt;
  const queued = enabled ? await requestedSearches(v.db, v.user.id) : [];
  const attempts = queued.length
    ? await v.db
        .select()
        .from(shelfRefresh)
        .where(eq(shelfRefresh.userId, v.user.id))
    : [];
  const readyRequest = queued.some((r) => {
    const existing = attempts.find(
      (a) => a.requestKey === `talk:${r.requestId}`,
    );
    return (
      !existing ||
      existing.outcome === "done" ||
      !existing.retryAt ||
      existing.retryAt <= new Date()
    );
  });
  const weeklyNeeded =
    !picks.some((r) => r.status === "current" && r.week === week) &&
    (!attempt ||
      (attempt.outcome === "unavailable" &&
        !!attempt.retryAt &&
        attempt.retryAt <= new Date()));
  return {
    current: (enabled ? picks : [])
      .filter((r) => r.status === "current" && r.week === week)
      .slice(0, 3)
      .map(view),
    saved: picks.filter((r) => r.status === "saved").map(view),
    searchEnabled: !!enabled,
    refreshNeeded: !!enabled && (readyRequest || weeklyNeeded),
  };
}

export async function getTodayShelfPick(v: Viewer): Promise<ShelfPick | null> {
  return (await getShelf(v)).current[0] ?? null;
}

export async function recentShelfFeedback(db: Db, userId: string) {
  return db
    .select()
    .from(shelfItem)
    .where(
      and(
        eq(shelfItem.userId, userId),
        eq(shelfItem.status, "not_for_me"),
        gte(shelfItem.feedbackAt, new Date(Date.now() - 28 * 86400000)),
      ),
    );
}

export async function setShelfFeedback(
  db: Db,
  userId: string,
  id: string,
  status: "saved" | "not_for_me",
) {
  const [previous] = await db
    .select()
    .from(shelfItem)
    .where(and(eq(shelfItem.userId, userId), eq(shelfItem.id, id)));
  if (!previous) return null;
  const token = new Date();
  const [changed] = await db
    .update(shelfItem)
    .set({ status, feedbackAt: token })
    .where(
      and(
        eq(shelfItem.userId, userId),
        eq(shelfItem.id, id),
        eq(shelfItem.status, previous.status),
      ),
    )
    .returning({ id: shelfItem.id });
  if (!changed) return null;
  // Owner-bound, sealed snapshot; Undo can only replace this exact feedback.
  return seal(
    JSON.stringify({
      userId,
      id,
      status,
      at: token.toISOString(),
      previous: previous.status,
      previousAt: previous.feedbackAt?.toISOString() ?? null,
    }),
  );
}

export async function undoShelfFeedback(db: Db, userId: string, token: string) {
  try {
    const { z } = await import("zod");
    const r = z
      .object({
        userId: z.string(),
        id: z.string(),
        status: z.enum(["saved", "not_for_me"]),
        at: z.iso.datetime(),
        previous: z.enum(["current", "saved", "not_for_me"]),
        previousAt: z.iso.datetime().nullable(),
      })
      .parse(JSON.parse(open(token)));
    if (r.userId !== userId) return false;
    const rows = await db
      .update(shelfItem)
      .set({
        status: r.previous,
        feedbackAt: r.previousAt ? new Date(r.previousAt) : null,
      })
      .where(
        and(
          eq(shelfItem.userId, userId),
          eq(shelfItem.id, r.id),
          eq(shelfItem.status, r.status),
          eq(shelfItem.feedbackAt, new Date(r.at)),
        ),
      )
      .returning({ id: shelfItem.id });
    return rows.length === 1;
  } catch {
    return false;
  }
}
