import "server-only";
import { and, count, eq, gte, ne } from "drizzle-orm";
import { cachedResourceOk, templateWhy, whyOk } from "@/domain/resource-screen";
import {
  buildResourceQuery,
  resourceTagsKey,
  resourceTagsSchema,
  type ResourceTags,
} from "@/domain/resources";
import { orderedSources } from "@/domain/sources";
import { mentionsFood, mentionsExercise } from "@/domain/plan-menu";
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
  getShelf,
  recentShelfFeedback,
  shelfContext,
  shelfWeek,
} from "../data/shelf";
import { screenResources } from "./screen";
import { searchEnabled, searchWeb } from "./tavily";

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
};

export async function refreshShelfFor(
  v: Viewer,
  explicit?: ResourceTags,
  requestId?: string,
): Promise<ShelfRefreshResult> {
  return locked(v.db, `owner:${v.user.id}`, async () => {
    const [settings] = await v.db
      .select()
      .from(profile)
      .where(eq(profile.userId, v.user.id));
    if (!settings || settings.coachingPausedAt || !searchEnabled())
      return { ok: false, count: 0, unavailable: true };
    if (
      !explicit &&
      (await getShelf({ ...v, profile: settings })).current.length
    )
      return { ok: true, count: 0 };
    const week = shelfWeek(v.today);
    const requestKey = requestId ? `talk:${requestId}` : `week:${week}`;
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
    const { model, eatingConcern } = await shelfContext(v);
    const feedback = await recentShelfFeedback(v.db, v.user.id);
    const region = ["GB", "US", "AU"].includes(settings.region ?? "")
      ? (settings.region as "GB" | "US" | "AU")
      : "global";
    const personal = settings.memoryOn ? model : undefined;
    const choices: ResourceTags[] = (
      personal?.goals.length ? personal.goals : ["through_day" as const]
    ).flatMap((goal) => {
      const interests = (personal?.lifts ?? []).filter(
        (l) =>
          l !== "other" &&
          !(eatingConcern && ["walking", "cooking"].includes(l)),
      );
      return (interests.length ? interests : [undefined]).map((interest) => ({
        goal,
        interest: interest as ResourceTags["interest"],
        format: "article",
        region,
      }));
    });
    // Weekly rotation is deterministic; recent negative tag/host feedback wins.
    const offset = Number(week.slice(-2)) % choices.length;
    const rotated = [...choices.slice(offset), ...choices.slice(0, offset)];
    const tags = resourceTagsSchema.parse(
      (explicit
        ? { ...explicit, region: explicit.region ?? region }
        : undefined) ??
        rotated.find(
          (t) => !feedback.some((r) => r.tagsKey === resourceTagsKey(t)),
        ) ?? { goal: "through_day", format: "article", region },
    );
    const tagsKey = resourceTagsKey(tags);
    if (
      eatingConcern &&
      (mentionsFood(buildResourceQuery(tags)) ||
        mentionsExercise(buildResourceQuery(tags)))
    )
      return { ok: false, count: 0 };
    const cacheKey = `${week}:${tagsKey}`;
    let countAdded = 0;
    const ownerWhys = new Map<string, string>();
    try {
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
        if ((usage?.n ?? 0) >= 3) throw new Error("daily cap");
        const hits = await searchWeb({
          query: buildResourceQuery(tags),
          includeDomains: orderedSources(tags.region).map((s) => s.host),
          maxResults: 6,
          userId: v.user.id,
          database: v.db,
        });
        const { kept } = await screenResources(hits, tags, v.user.id);
        for (const r of kept) ownerWhys.set(r.url, r.why);
        const publicResults = kept.map((r) => ({
          title: r.title,
          url: r.url,
          host: r.host,
          adult: r.adult,
          foodOrExercise: r.foodOrExercise,
          aiScreened: r.aiScreened,
        }));
        // Never store a why line or fetched snippet in this global cache.
        await v.db
          .insert(resourceCache)
          .values({ key: cacheKey, results: publicResults })
          .onConflictDoNothing();
        return publicResults;
      });
      const safe = results.filter((r) =>
        cachedResourceOk(r, eatingConcern, env().KOE_AI === "on"),
      );
      const order = orderedSources(tags.region).map((s) => s.host);
      safe.sort(
        (a, b) =>
          Number(feedback.some((f) => f.host === a.host)) -
            Number(feedback.some((f) => f.host === b.host)) ||
          order.indexOf(a.host as (typeof order)[number]) -
            order.indexOf(b.host as (typeof order)[number]),
      );
      await v.db.transaction(async (tx) => {
        // A safety pause or deletion during the provider call cancels the write.
        const [fresh] = await tx
          .select()
          .from(profile)
          .where(eq(profile.userId, v.user.id));
        if (!fresh || fresh.coachingPausedAt || !searchEnabled())
          throw new Error("paused");
        for (const r of safe.slice(0, 3)) {
          const proposedWhy = ownerWhys.get(r.url) ?? templateWhy(tags);
          const why = whyOk(proposedWhy, eatingConcern)
            ? proposedWhy
            : templateWhy(tags);
          const inserted = await tx
            .insert(shelfItem)
            .values({
              userId: v.user.id,
              url: r.url,
              title: r.title,
              host: r.host,
              whyEnc: seal(why),
              tagsKey,
              week,
              foodOrExercise: r.foodOrExercise,
              aiScreened: r.aiScreened,
            })
            .onConflictDoUpdate({
              target: [shelfItem.userId, shelfItem.url],
              set: {
                week,
                tagsKey,
                whyEnc: seal(why),
                foodOrExercise: r.foodOrExercise,
                aiScreened: r.aiScreened,
              },
              setWhere: and(
                eq(shelfItem.status, "current"),
                ne(shelfItem.week, week),
              ),
            })
            .returning({ id: shelfItem.id });
          countAdded += inserted.length;
        }
        await tx
          .insert(shelfRefresh)
          .values({
            userId: v.user.id,
            requestKey,
            week,
            tagsKey,
            count: countAdded,
            outcome: "done",
          })
          .onConflictDoUpdate({
            target: [shelfRefresh.userId, shelfRefresh.requestKey],
            set: { count: countAdded, outcome: "done", retryAt: null },
          });
      });
      return { ok: true, count: countAdded };
    } catch {
      // Account deletion may race a provider response. Do not recreate state
      // or let the attempt ledger's owner FK escape as an action error.
      const [owner] = await v.db
        .select({ id: profile.userId })
        .from(profile)
        .where(eq(profile.userId, v.user.id));
      if (!owner) return { ok: false, count: 0, unavailable: true };
      await v.db
        .insert(shelfRefresh)
        .values({
          userId: v.user.id,
          requestKey,
          week,
          tagsKey,
          outcome: "unavailable",
          retryAt: new Date(Date.now() + 15 * 60000),
        })
        .onConflictDoUpdate({
          target: [shelfRefresh.userId, shelfRefresh.requestKey],
          set: {
            outcome: "unavailable",
            retryAt: new Date(Date.now() + 15 * 60000),
          },
        });
      return { ok: false, count: 0, unavailable: true };
    }
  });
}
