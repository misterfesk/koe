import "server-only";
import { tavily } from "@tavily/core";
import { env } from "../env";
import { aiBudgetLeft, recordRun } from "../llm/usage";
import { searchStubbed, stubSearchHits } from "./stub";
import { and, count, eq, gte } from "drizzle-orm";
import type { Db } from "../db";
import { agentRun } from "../db/schema";

export const searchEnabled = () =>
  env().KOE_SEARCH !== "off" && (!!env().TAVILY_API_KEY || searchStubbed());

export class SearchUnavailable extends Error {
  constructor(reason: string) {
    super(`Search unavailable: ${reason}`);
  }
}

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  score: number;
};

const TIMEOUT_MS = 10_000;

/**
 * Web search through Tavily. Callers decide what to search for and which
 * domains to trust; this only runs the query and logs a text-free usage row.
 * Any failure surfaces as SearchUnavailable so callers can carry on without it.
 */
export async function searchWeb(input: {
  query: string;
  includeDomains?: string[];
  maxResults?: number;
  userId?: string;
  database?: Db;
}): Promise<SearchHit[]> {
  const e = env();
  if (e.KOE_SEARCH === "off")
    throw new SearchUnavailable("switched off by operator");
  if (!e.TAVILY_API_KEY && !searchStubbed())
    throw new SearchUnavailable("no API key");
  if (input.userId) {
    if (input.database) {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const [used] = await input.database
        .select({ n: count() })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.userId, input.userId),
            gte(agentRun.createdAt, start),
          ),
        );
      if ((used?.n ?? 0) >= e.KOE_AI_DAILY_CALLS)
        throw new SearchUnavailable("daily limit");
    } else if ((await aiBudgetLeft(input.userId)) <= 0)
      throw new SearchUnavailable("daily limit");
  }

  const started = Date.now();
  // Reserve before the provider call: interruption and logging errors cannot
  // silently grant extra searches. The pipeline serializes this owner's calls.
  const [reserved] = input.database
    ? await input.database
        .insert(agentRun)
        .values({
          userId: input.userId,
          purpose: "search",
          model: "tavily",
          ok: false,
          // Match recordRun: timestamp columns are read as UTC by the driver.
          createdAt: new Date(),
        })
        .returning({ id: agentRun.id })
    : [];
  let hits: SearchHit[] | undefined;
  try {
    if (searchStubbed()) hits = stubSearchHits();
    else {
      const res = await tavily({ apiKey: e.TAVILY_API_KEY! }).search(
        input.query,
        {
          searchDepth: "basic",
          maxResults: input.maxResults ?? 5,
          includeDomains: input.includeDomains,
          // Seconds. The SDK aborts the request itself after this long.
          timeout: TIMEOUT_MS / 1000,
        },
      );
      hits = res.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      }));
    }
  } catch {
    // The reason is left out of the message: it can echo the query or the key.
  }
  if (input.database && reserved)
    await input.database
      .update(agentRun)
      .set({ latencyMs: Date.now() - started, ok: !!hits })
      .where(eq(agentRun.id, reserved.id));
  else
    await recordRun({
      userId: input.userId,
      purpose: "search",
      model: "tavily",
      latencyMs: Date.now() - started,
      ok: !!hits,
    });
  if (!hits) throw new SearchUnavailable("request failed");
  return hits;
}
