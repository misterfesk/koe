import "server-only";
import { tavily } from "@tavily/core";
import { env } from "../env";
import { aiBudgetLeft, recordRun } from "../llm/usage";

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
}): Promise<SearchHit[]> {
  const e = env();
  if (e.KOE_SEARCH === "off")
    throw new SearchUnavailable("switched off by operator");
  if (!e.TAVILY_API_KEY) throw new SearchUnavailable("no API key");
  if (input.userId && (await aiBudgetLeft(input.userId)) <= 0)
    throw new SearchUnavailable("daily limit");

  const started = Date.now();
  let hits: SearchHit[] | undefined;
  try {
    const res = await tavily({ apiKey: e.TAVILY_API_KEY }).search(input.query, {
      searchDepth: "basic",
      maxResults: input.maxResults ?? 5,
      includeDomains: input.includeDomains,
      // Seconds. The SDK aborts the request itself after this long.
      timeout: TIMEOUT_MS / 1000,
    });
    hits = res.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));
  } catch {
    // The reason is left out of the message: it can echo the query or the key.
  }
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
