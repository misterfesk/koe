import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  cachedResourceOk,
  goalWhy,
  noteWhy,
  resourceSource,
  type PublicResource,
} from "@/domain/resource-screen";
import {
  parseResourceTagsKey,
  weekTopics,
  type WeekTopic,
} from "@/domain/resources";
import { readCaptured } from "@/domain/week";
import type { Db } from "../db";
import {
  shelfCoverCache,
  shelfItem,
  shelfRefresh,
  week,
  weekItem,
} from "../db/schema";
import { open, seal } from "../crypto";
import { env } from "../env";
import type { Viewer } from "../viewer";
import { getUserModel } from "./intake";
import { searchEnabled } from "../search/tavily";
import { shelfLoading } from "../search/in-flight";
import { coverKey } from "../search/cover";
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

/** Day one aims for 5 picks; the weekly top-up fills towards 10. */
export const DAY_ONE_TARGET = 5;
export const WEEK_TARGET = 10;

export type ShelfCover = { kind: "youtube" | "image" | "none"; src?: string };
export type ShelfPick = {
  id: string;
  title: string;
  url: string;
  host: string;
  /** Publisher name: the site, or the allowlisted YouTube channel. */
  sourceName: string;
  /** Fixed template; may be empty. */
  why: string;
  format: "article" | "video";
  readMinutes?: number;
  videoId?: string;
  cover: ShelfCover;
  /** The This week topic whose query found this pick, if any. */
  weekTopic?: WeekTopic;
  /** True when it came from a This week topic query ("For your week"). */
  forWeek: boolean;
};
export type ShelfView = {
  current: ShelfPick[];
  saved: ShelfPick[];
  searchEnabled: boolean;
  refreshNeeded: boolean;
  /** A refresh is running for this person (day one runs in the background). */
  loading: boolean;
  /** Topics of the newest week's things; empty with memory off or no week. */
  weekTopics: WeekTopic[];
};

export async function listShelfExport(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(shelfItem)
    .where(eq(shelfItem.userId, userId))
    .orderBy(desc(shelfItem.createdAt));
  return rows.map(({ whyEnc, ...r }) => ({ ...r, why: open(whyEnc) }));
}

/** The newest week's things that have a Shelf topic. Memory off: none. */
export async function weekTopicThings(
  db: Db,
  userId: string,
  memoryOn: boolean,
): Promise<{ topic: WeekTopic; title: string }[]> {
  if (!memoryOn) return [];
  const [latest] = await db
    .select({ id: week.id, reviewedAt: week.reviewedAt })
    .from(week)
    .where(eq(week.userId, userId))
    .orderBy(desc(week.createdAt))
    .limit(1);
  // A reviewed week with no newer week: no week topics.
  if (!latest || latest.reviewedAt) return [];
  const items = await db
    .select()
    .from(weekItem)
    .where(and(eq(weekItem.weekId, latest.id), eq(weekItem.userId, userId)))
    .orderBy(weekItem.order);
  return items.flatMap((i) =>
    weekTopics.includes(i.topic as WeekTopic)
      ? [
          {
            topic: i.topic as WeekTopic,
            title: readCaptured(JSON.parse(open(i.capturedEnc))).title,
          },
        ]
      : [],
  );
}

export type RefreshMode = {
  mode: "day1" | "topup" | "weekly";
  requestKey: string;
};

/**
 * Which automatic refresh an open may run, if any. Day one runs once, until it
 * completes; on that same day one top-up may follow, never more. On later
 * days the weekly refresh runs once per week, towards 10.
 */
export async function nextRefresh(
  db: Db,
  userId: string,
  today: string,
  currentThisWeek: number,
  hasHistory: boolean,
): Promise<RefreshMode | null> {
  const rows = await db
    .select()
    .from(shelfRefresh)
    .where(eq(shelfRefresh.userId, userId));
  const byKey = new Map(rows.map((r) => [r.requestKey, r]));
  const ready = (key: string) => {
    const r = byKey.get(key);
    return (
      !r ||
      (r.outcome === "unavailable" && !!r.retryAt && r.retryAt <= new Date())
    );
  };
  const dayOne = rows.find(
    (r) => r.outcome === "done" && r.requestKey.startsWith("day1:"),
  );
  if (!dayOne) {
    if (!hasHistory)
      return ready(`day1:${today}`)
        ? { mode: "day1", requestKey: `day1:${today}` }
        : null;
  } else if (dayOne.requestKey === `day1:${today}`) {
    const key = `day1-topup:${today}`;
    return currentThisWeek < DAY_ONE_TARGET && !byKey.has(key)
      ? { mode: "topup", requestKey: key }
      : null;
  }
  const key = `week:${shelfWeek(today)}`;
  return currentThisWeek < WEEK_TARGET && ready(key)
    ? { mode: "weekly", requestKey: key }
    : null;
}

async function readyCovers(db: Db, urls: string[]) {
  if (!urls.length) return new Set<string>();
  const rows = await db
    .select({ key: shelfCoverCache.key, data: shelfCoverCache.dataBase64 })
    .from(shelfCoverCache)
    .where(inArray(shelfCoverCache.key, urls.map(coverKey)));
  return new Set(rows.filter((r) => !!r.data).map((r) => r.key));
}

/** Read-only: safe to await during page rendering; never calls a provider. */
export async function getShelf(v: Viewer): Promise<ShelfView> {
  const thisWeek = shelfWeek(v.today);
  const { eatingConcern, model } = await shelfContext(v);
  const memoryOn = v.profile?.memoryOn !== false;
  // Only goals the person chose may be named in a why line.
  const chosen = memoryOn ? (model?.goals ?? []) : [];
  const rows = await listShelfExport(v.db, v.user.id);
  const aiOn = env().KOE_AI === "on";
  const picks = rows.flatMap((r) => {
    const resource: PublicResource = {
      title: r.title,
      url: r.url,
      host: r.host,
      adult: true,
      foodOrExercise: r.foodOrExercise,
      aiScreened: r.aiScreened,
      format: r.format,
      ...(r.videoId ? { videoId: r.videoId } : {}),
      ...(r.channel ? { channel: r.channel } : {}),
      ...(r.readMinutes ? { readMinutes: r.readMinutes } : {}),
    };
    if (!cachedResourceOk(resource, eatingConcern, aiOn)) return [];
    const tags = parseResourceTagsKey(r.tagsKey);
    const source = resourceSource(resource);
    if (!tags || !source) return [];
    // Week titles and personal notes are stored sealed per person and shown only with memory on.
    const why = !memoryOn
      ? ""
      : r.why.startsWith('For "') ||
          r.why.startsWith('Because you noted "') ||
          r.why.startsWith("Because you mentioned ")
        ? r.why
        : tags.weekTopic
          ? ""
          : goalWhy(tags, chosen);
    return [{ ...r, tags, why, sourceName: source.name }];
  });
  const covers = await readyCovers(
    v.db,
    picks.filter((p) => p.format === "article").map((p) => p.url),
  );
  const view = (r: (typeof picks)[number]): ShelfPick => {
    const key = coverKey(r.url);
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      host: r.host,
      sourceName: r.sourceName,
      why: r.why,
      format: r.format,
      ...(r.readMinutes ? { readMinutes: r.readMinutes } : {}),
      ...(r.videoId ? { videoId: r.videoId } : {}),
      cover: r.videoId
        ? {
            kind: "youtube",
            src: `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
          }
        : covers.has(key)
          ? { kind: "image", src: `/api/shelf/cover/${key}` }
          : { kind: "none" },
      ...(r.tags.weekTopic ? { weekTopic: r.tags.weekTopic } : {}),
      forWeek: !!r.tags.weekTopic,
    };
  };
  const enabled = searchEnabled() && !v.profile.coachingPausedAt;
  const loading = enabled && shelfLoading(v.user.id);
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
  const current = picks.filter(
    (r) => r.status === "current" && r.week === thisWeek,
  );
  const automatic =
    enabled && !loading
      ? await nextRefresh(
          v.db,
          v.user.id,
          v.today,
          current.length,
          rows.length > 0,
        )
      : null;
  return {
    current: (enabled ? current : []).slice(0, WEEK_TARGET).map(view),
    saved: picks.filter((r) => r.status === "saved").map(view),
    searchEnabled: !!enabled,
    refreshNeeded: !!enabled && !loading && (readyRequest || !!automatic),
    loading: !!loading,
    weekTopics: [
      ...new Set(
        (await weekTopicThings(v.db, v.user.id, memoryOn)).map((t) => t.topic),
      ),
    ],
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
      previousAt: previous.feedbackAt?.toISOString(),
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
        at: z.string(),
        previous: z.enum(["current", "saved", "not_for_me"]),
        previousAt: z.string().optional(),
      })
      .parse(JSON.parse(open(token)));
    if (r.userId !== userId) return false;
    const [restored] = await db
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
    return !!restored;
  } catch {
    return false;
  }
}

export async function updateShelfNoteWhy(
  db: Db,
  userId: string,
  oldText: string,
  newText: string,
) {
  const oldWhy = noteWhy(oldText);
  const newWhy = noteWhy(newText);
  if (!oldWhy || oldWhy === newWhy) return;
  const items = await db
    .select({ id: shelfItem.id, whyEnc: shelfItem.whyEnc })
    .from(shelfItem)
    .where(eq(shelfItem.userId, userId));
  for (const item of items) {
    const why = open(item.whyEnc);
    if (why === oldWhy) {
      await db
        .update(shelfItem)
        .set({ whyEnc: seal(newWhy) })
        .where(and(eq(shelfItem.userId, userId), eq(shelfItem.id, item.id)));
    }
  }
}

export async function removeShelfNoteWhy(
  db: Db,
  userId: string,
  noteText: string,
) {
  const targetWhy = noteWhy(noteText);
  if (!targetWhy) return;
  const items = await db
    .select({
      id: shelfItem.id,
      status: shelfItem.status,
      whyEnc: shelfItem.whyEnc,
    })
    .from(shelfItem)
    .where(eq(shelfItem.userId, userId));
  for (const item of items) {
    const why = open(item.whyEnc);
    if (why === targetWhy) {
      if (item.status === "current") {
        await db
          .delete(shelfItem)
          .where(and(eq(shelfItem.userId, userId), eq(shelfItem.id, item.id)));
      } else {
        await db
          .update(shelfItem)
          .set({ whyEnc: seal("") })
          .where(and(eq(shelfItem.userId, userId), eq(shelfItem.id, item.id)));
      }
    }
  }
}
