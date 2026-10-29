import "server-only";
import { after } from "next/server";
import { and, count, eq, gte, like, ne } from "drizzle-orm";
import {
  cachedResourceOk,
  goalWhy,
  weekWhy,
  type PublicResource,
} from "@/domain/resource-screen";
import {
  buildResourceQuery,
  resourceTagsKey,
  resourceTagsSchema,
  type ResourceTags,
  type WeekTopic,
} from "@/domain/resources";
import { orderedSources } from "@/domain/sources";
import { mentionsFood, mentionsExercise } from "@/domain/plan-menu";
import type { Goal } from "@/domain/intake";
import type { Viewer } from "../viewer";
import type { Db } from "../db";
import {
  agentRun,
  profile,
  resourceCache,
  shelfItem,
  shelfRefresh,
} from "../db/schema";
import { seal } from "../crypto";
import { env } from "../env";
import {
  DAY_ONE_TARGET,
  WEEK_TARGET,
  listShelfExport,
  nextRefresh,
  recentShelfFeedback,
  shelfContext,
  shelfWeek,
  weekTopicThings,
  type RefreshMode,
} from "../data/shelf";
import { screenResources } from "./screen";
import { searchEnabled, searchWeb } from "./tavily";
import { ensureCovers } from "./cover";
import { markShelfRunning } from "./in-flight";
import { classifyWeekTopics } from "./week-topics";
import { planPersonalizedSearches, type PlannedSearch } from "./intents";

// Koe is single-instance (PGlite); serialize owner work and coalesce shared
// public cache misses. These maps contain no snippets and release on failure.
const locks = new WeakMap<Db, Map<string, Promise<unknown>>>();
async function locked<T>(db: Db, key: string, f: () => Promise<T>): Promise<T> {
  let map = locks.get(db);
  if (!map) {
    map = new Map();
    locks.set(db, map);
  }
  const previous = map.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(f);
  map.set(key, next);
  try {
    return await next;
  } finally {
    if (map.get(key) === next) map.delete(key);
  }
}

export type ShelfRefreshResult = {
  ok: boolean;
  count: number;
  unavailable?: boolean;
  rateLimited?: boolean;
};

const DAILY_SEARCHES = 3;
const MANUAL_DAILY_SEARCHES = 12;
export const MANUAL_REFRESH_DAILY_LIMIT = 3;
const TALK_TARGET = 3;
/** At most this many tag sets per weekly refresh; searches stay under the cap. */
const WEEKLY_TAG_SETS = 4;

type Interest = NonNullable<ResourceTags["interest"]>;
type Ctx = {
  v: Viewer;
  region: "GB" | "US" | "AU" | "global";
  eatingConcern: boolean;
  chosen: Goal[];
  interests: Interest[];
  feedback: Awaited<ReturnType<typeof recentShelfFeedback>>;
  week: string;
  things: { topic: WeekTopic; title: string }[];
};

const unsafeQuery = (ctx: Ctx, tags: ResourceTags) =>
  ctx.eatingConcern &&
  (mentionsFood(buildResourceQuery(tags)) ||
    mentionsExercise(buildResourceQuery(tags)));

/** Enum tags only; never words the person wrote. */
function usable(ctx: Ctx, list: ResourceTags[]) {
  const seen = new Set<string>();
  return list
    .map((t) => resourceTagsSchema.parse({ ...t, region: ctx.region }))
    .filter((t) => {
      const key = resourceTagsKey(t);
      if (seen.has(key) || unsafeQuery(ctx, t)) return false;
      seen.add(key);
      // A recent Not for me on a tag set skips it.
      return !ctx.feedback.some((r) => r.tagsKey === key);
    });
}

function toPlanned(ctx: Ctx, tags: ResourceTags): PlannedSearch {
  return {
    tags,
    tagsKey: resourceTagsKey(tags),
    query: buildResourceQuery(tags),
    why: tags.weekTopic
      ? weekWhy(ctx.things.find((t) => t.topic === tags.weekTopic)?.title)
      : goalWhy(tags, ctx.chosen),
    custom: false,
  };
}

const topGoals = (ctx: Ctx): Goal[] =>
  ctx.chosen.length ? ctx.chosen : ["through_day"];

/** Day one: at most 2 fixed-topic queries, a read and a video. */
function dayOneTags(ctx: Ctx) {
  const [goal] = topGoals(ctx);
  return usable(ctx, [
    { goal, interest: ctx.interests[0], format: "article" },
    { goal, format: "video" },
  ]).slice(0, 2);
}

/** The single same-day top-up: the next fixed topic not used on day one. */
function topUpTags(ctx: Ctx) {
  const goals = topGoals(ctx);
  const used = new Set(dayOneTags(ctx).map(resourceTagsKey));
  return usable(ctx, [
    {
      goal: goals[1] ?? goals[0],
      interest: ctx.interests[1],
      format: "article",
    },
    { goal: goals[0], format: "article" },
    { goal: goals[0], interest: ctx.interests[1], format: "video" },
    // Generic fallbacks; a goal the person did not choose is never named.
    { goal: "through_day", format: "article" },
    { goal: "basics", format: "article" },
  ])
    .filter((t) => !used.has(resourceTagsKey(t)))
    .slice(0, 1);
}

/** Weekly: this week's topics first, then a rotation of goal/interest tags. */
function weeklyTags(ctx: Ctx) {
  const goals = topGoals(ctx);
  const fixed: ResourceTags[] = [
    ...goals.flatMap((goal) =>
      (ctx.interests.length ? ctx.interests : [undefined]).map((interest) => ({
        goal,
        interest,
        format: "article" as const,
      })),
    ),
    ...goals.map((goal) => ({ goal, format: "video" as const })),
  ];
  const offset = Number(ctx.week.slice(-2)) % fixed.length;
  const rotated = [...fixed.slice(offset), ...fixed.slice(0, offset)];
  const topics = [...new Set(ctx.things.map((t) => t.topic))].map(
    (weekTopic): ResourceTags => ({
      goal: goals[0],
      weekTopic,
      format: "article",
    }),
  );
  return usable(ctx, [...topics, ...rotated]).slice(0, WEEKLY_TAG_SETS);
}

/** Screened public results for one planned search: the shared cache, else one search. */
async function resultsFor(ctx: Ctx, planned: PlannedSearch, manual = false) {
  const { v } = ctx;
  const { tags, tagsKey, query, custom } = planned;
  const cacheKey = `${ctx.week}:${tagsKey}`;
  const video = tags.format === "video";
  const dailyCap = manual ? MANUAL_DAILY_SEARCHES : DAILY_SEARCHES;
  const results = await locked(v.db, `cache:${cacheKey}`, async () => {
    const [cached] = await v.db
      .select()
      .from(resourceCache)
      .where(eq(resourceCache.key, cacheKey));
    if (cached) return Array.isArray(cached.results) ? cached.results : [];
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [usage] = await v.db
      .select({ n: count() })
      .from(agentRun)
      .where(
        and(
          eq(agentRun.userId, v.user.id),
          eq(agentRun.purpose, "search"),
          gte(agentRun.createdAt, start),
        ),
      );
    if ((usage?.n ?? 0) >= dailyCap) throw new Error("daily cap");
    const hits = await searchWeb({
      query,
      includeDomains: video ? ["youtube.com"] : [],
      maxResults: 6,
      rawContent: !video,
      userId: v.user.id,
      database: v.db,
    });
    const { kept } = await screenResources(
      hits,
      tags,
      v.user.id,
      custom ? query : undefined,
    );
    // Public result data only: never a why line, snippet or page text.
    await v.db
      .insert(resourceCache)
      .values({ key: cacheKey, results: kept })
      .onConflictDoNothing();
    return kept;
  });
  const aiOn = env().KOE_AI === "on";
  const safe = (results as unknown[]).filter((r): r is PublicResource =>
    cachedResourceOk(r, ctx.eatingConcern, aiOn),
  );
  const order: string[] = orderedSources(tags.region).map((s) => s.host);
  const rankHost = (host: string) => {
    const idx = order.indexOf(host);
    return idx === -1 ? order.length : idx;
  };
  const disliked = (r: PublicResource) =>
    Number(r.format !== "video" && ctx.feedback.some((f) => f.host === r.host));
  return safe.sort(
    (a, b) => disliked(a) - disliked(b) || rankHost(a.host) - rankHost(b.host),
  );
}

/** Round-robin across tag sets, so reads and videos mix. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

async function fill(
  ctx: Ctx,
  plan: PlannedSearch[],
  target: number,
  requestKey: string,
  runAll: boolean,
  manual = false,
): Promise<ShelfRefreshResult> {
  const { v } = ctx;
  const existing = new Map(
    (await listShelfExport(v.db, v.user.id)).map((r) => [r.url, r]),
  );
  const fresh = (r: PublicResource) => {
    const row = existing.get(r.url);
    if (!row) return true;
    if (manual && row.status === "current") return true;
    return row.status === "current" && row.week !== ctx.week;
  };
  const batches: { planned: PlannedSearch; list: PublicResource[] }[] = [];
  let failed = false;
  for (const planned of plan) {
    const have = new Set(
      batches.flatMap((b) => b.list.filter(fresh).map((r) => r.url)),
    );
    if (!runAll && have.size >= target) break;
    try {
      batches.push({ planned, list: await resultsFor(ctx, planned, manual) });
    } catch (error) {
      failed = true;
      if ((error as Error).message === "daily cap") break;
    }
  }
  if (failed && !batches.length) throw new Error("unavailable");
  const chosen: { r: PublicResource; planned: PlannedSearch }[] = [];
  for (const pick of interleave(
    batches.map((b) => b.list.map((r) => ({ r, planned: b.planned }))),
  )) {
    if (chosen.length >= target) break;
    if (fresh(pick.r) && !chosen.some((c) => c.r.url === pick.r.url))
      chosen.push(pick);
  }
  let added = 0;
  const articles: string[] = [];
  await v.db.transaction(async (tx) => {
    // A safety pause or deletion during the provider call cancels the write.
    const [current] = await tx
      .select()
      .from(profile)
      .where(eq(profile.userId, v.user.id));
    if (!current || current.coachingPausedAt || !searchEnabled())
      throw new Error("paused");
    if (manual && chosen.length > 0) {
      await tx
        .delete(shelfItem)
        .where(
          and(eq(shelfItem.userId, v.user.id), eq(shelfItem.status, "current")),
        );
    }
    for (const { r, planned } of chosen) {
      const facts = {
        week: ctx.week,
        tagsKey: planned.tagsKey,
        // Per person and sealed; never in the shared cache.
        whyEnc: seal(planned.why),
        foodOrExercise: r.foodOrExercise,
        aiScreened: r.aiScreened,
        format: r.format ?? ("article" as const),
        videoId: r.videoId ?? null,
        channel: r.channel ?? null,
        readMinutes: r.readMinutes ?? null,
      };
      const inserted = await tx
        .insert(shelfItem)
        .values({
          userId: v.user.id,
          url: r.url,
          title: r.title,
          host: r.host,
          ...facts,
        })
        .onConflictDoUpdate({
          target: [shelfItem.userId, shelfItem.url],
          set: facts,
          setWhere: and(
            eq(shelfItem.status, "current"),
            ne(shelfItem.week, ctx.week),
          ),
        })
        .returning({ id: shelfItem.id });
      added += inserted.length;
      if (inserted.length && r.format !== "video") articles.push(r.url);
    }
    await tx
      .insert(shelfRefresh)
      .values({
        userId: v.user.id,
        requestKey,
        week: ctx.week,
        tagsKey: plan[0] ? plan[0].tagsKey : "",
        count: added,
        outcome: "done",
      })
      .onConflictDoUpdate({
        target: [shelfRefresh.userId, shelfRefresh.requestKey],
        set: { count: added, outcome: "done", retryAt: null },
      });
  });
  await ensureCovers(v.db, articles);
  return { ok: true, count: added };
}

async function recordUnavailable(
  v: Viewer,
  requestKey: string,
  tagsKey: string,
  retry: boolean,
) {
  // Account deletion may race a provider response. Do not recreate state
  // or let the attempt ledger's owner FK escape as an action error.
  const [owner] = await v.db
    .select({ id: profile.userId })
    .from(profile)
    .where(eq(profile.userId, v.user.id));
  if (!owner) return;
  const retryAt = retry ? new Date(Date.now() + 15 * 60000) : null;
  await v.db
    .insert(shelfRefresh)
    .values({
      userId: v.user.id,
      requestKey,
      week: shelfWeek(v.today),
      tagsKey,
      outcome: "unavailable",
      retryAt,
    })
    .onConflictDoUpdate({
      target: [shelfRefresh.userId, shelfRefresh.requestKey],
      set: { outcome: "unavailable", retryAt },
    });
}

/**
 * One Shelf refresh. With `explicit` tags it serves a Talk request (keyed by
 * `requestId`); with `options.manual` it rebuilds the Shelf from the latest
 * user data within the daily manual refresh limit; otherwise it runs whichever
 * of day one, the same-day top-up or the weekly top-up is due, or nothing.
 */
export async function refreshShelfFor(
  v: Viewer,
  explicit?: ResourceTags,
  requestId?: string,
  options?: { manual?: boolean },
): Promise<ShelfRefreshResult> {
  const release = markShelfRunning(v.user.id);
  try {
    return await locked(v.db, `owner:${v.user.id}`, () =>
      refreshLocked(v, explicit, requestId, options),
    );
  } finally {
    release();
  }
}

async function refreshLocked(
  v: Viewer,
  explicit?: ResourceTags,
  requestId?: string,
  options?: { manual?: boolean },
): Promise<ShelfRefreshResult> {
  const [settings] = await v.db
    .select()
    .from(profile)
    .where(eq(profile.userId, v.user.id));
  if (!settings || settings.coachingPausedAt || !searchEnabled())
    return { ok: false, count: 0, unavailable: true };
  const week = shelfWeek(v.today);
  const manual = !!options?.manual;

  if (manual) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [manualUsed] = await v.db
      .select({ n: count() })
      .from(shelfRefresh)
      .where(
        and(
          eq(shelfRefresh.userId, v.user.id),
          like(shelfRefresh.requestKey, "manual:%"),
          gte(shelfRefresh.createdAt, start),
        ),
      );
    if ((manualUsed?.n ?? 0) >= MANUAL_REFRESH_DAILY_LIMIT)
      return { ok: true, count: 0, rateLimited: true };
  }

  const rows = await listShelfExport(v.db, v.user.id);
  const current = rows.filter(
    (r) => r.status === "current" && r.week === week,
  ).length;
  let due: RefreshMode | null = null;
  let requestKey: string;
  if (manual) {
    requestKey = `manual:${v.today}:${Date.now()}`;
  } else if (explicit) {
    requestKey = requestId ? `talk:${requestId}` : `week:${week}`;
    const [attempt] = await v.db
      .select()
      .from(shelfRefresh)
      .where(
        and(
          eq(shelfRefresh.userId, v.user.id),
          eq(shelfRefresh.requestKey, requestKey),
        ),
      );
    if (attempt?.outcome === "done") return { ok: true, count: attempt.count };
    if (attempt?.retryAt && attempt.retryAt > new Date())
      return { ok: false, count: 0, unavailable: true };
  } else {
    due = await nextRefresh(v.db, v.user.id, v.today, current, rows.length > 0);
    if (!due) return { ok: true, count: 0 };
    requestKey = due.requestKey;
  }
  if (due?.mode === "weekly" || manual)
    await classifyWeekTopics(v.db, v.user.id, settings.memoryOn);
  const { model, eatingConcern } = await shelfContext(v);
  const personal = settings.memoryOn ? model : undefined;
  const ctx: Ctx = {
    v,
    region: ["GB", "US", "AU"].includes(settings.region ?? "")
      ? (settings.region as "GB" | "US" | "AU")
      : "global",
    eatingConcern,
    chosen: personal?.goals ?? [],
    interests: (personal?.lifts ?? []).filter(
      (l): l is Interest =>
        l !== "other" && !(eatingConcern && ["walking", "cooking"].includes(l)),
    ),
    feedback: await recentShelfFeedback(v.db, v.user.id),
    week,
    things:
      due?.mode === "weekly" || due?.mode === "day1" || manual
        ? await weekTopicThings(v.db, v.user.id, settings.memoryOn)
        : [],
  };
  let plan: PlannedSearch[];
  let target: number;
  if (explicit) {
    const tags = resourceTagsSchema.parse({
      ...explicit,
      region: explicit.region ?? ctx.region,
    });
    if (unsafeQuery(ctx, tags)) return { ok: false, count: 0 };
    plan = [toPlanned(ctx, tags)];
    target = TALK_TARGET;
  } else {
    const maxIntents = manual
      ? 3
      : due!.mode === "day1"
        ? 2
        : due!.mode === "topup"
          ? 1
          : WEEKLY_TAG_SETS;
    const personalized = await planPersonalizedSearches({
      v,
      region: ctx.region,
      eatingConcern,
      memoryOn: settings.memoryOn,
      model: personal,
      things: ctx.things,
      dislikedKeys: new Set(ctx.feedback.map((f) => f.tagsKey)),
      maxIntents,
    });
    const fallbackTags = manual
      ? weeklyTags(ctx).slice(0, 3)
      : due!.mode === "day1"
        ? dayOneTags(ctx)
        : due!.mode === "topup"
          ? topUpTags(ctx)
          : weeklyTags(ctx);
    const fallbacks = fallbackTags.map((t) => toPlanned(ctx, t));
    plan = personalized?.length ? personalized : fallbacks;
    target = manual
      ? DAY_ONE_TARGET
      : (due!.mode === "weekly" ? WEEK_TARGET : DAY_ONE_TARGET) - current;
  }
  try {
    return await fill(
      ctx,
      plan,
      target,
      requestKey,
      due?.mode === "day1" || manual,
      manual,
    );
  } catch {
    // Day one and weekly retry on a later open; the top-up never retries.
    await recordUnavailable(
      v,
      requestKey,
      plan[0] ? plan[0].tagsKey : "",
      due?.mode !== "topup" && !manual,
    );
    return { ok: false, count: 0, unavailable: true };
  }
}

/**
 * After an intake or interview save: classify the week's things, then run
 * day one in the background. `loading` is true from this call until it ends.
 */
export function startShelfAfterSave(v: Viewer) {
  if (!searchEnabled() || v.profile.coachingPausedAt) return;
  const release = markShelfRunning(v.user.id);
  const job = async () => {
    try {
      await classifyWeekTopics(v.db, v.user.id, v.profile.memoryOn);
      await refreshShelfFor(v);
    } catch {
      // The Shelf shows its empty state and retries on a later open.
    } finally {
      release();
    }
  };
  try {
    after(job);
  } catch {
    // Outside a request (tests, scripts) run it detached.
    void job();
  }
}
