import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { agentRun } from "../db/schema";
import { env } from "../env";

/** Why a call was made. One list, so the usage log groups the same way everywhere. */
export const aiPurposes = [
  "talk",
  "talk_safety",
  "talk_summary",
  "coach",
  "intake",
  "interview_turn",
  "interview_breakdown",
  "planner",
  "resource_screen",
  "lookback",
  "eval",
  "search",
] as const;
export type Purpose = (typeof aiPurposes)[number];

type Price = { in: number; out: number; cachedIn?: number };

// USD per 1M tokens, Nebius Token Factory list prices (checked 2026-10-26).
// A model missing here is logged with a null cost rather than a guess.
export const prices: Record<string, Price> = {
  "nvidia/Nemotron-3-Ultra-550b-a55b": { in: 1, out: 3, cachedIn: 0.12 },
  "nvidia/nemotron-3-super-120b-a12b": { in: 0.3, out: 0.9 },
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { in: 0.06, out: 0.24 },
};

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cachedIn = 0,
) {
  const p = prices[model];
  if (!p) return null;
  const cached = Math.min(cachedIn, tokensIn);
  const usd =
    ((tokensIn - cached) * p.in +
      cached * (p.cachedIn ?? p.in) +
      tokensOut * p.out) /
    1_000_000;
  return usd;
}

export type RunRecord = {
  userId?: string;
  purpose: Purpose;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedIn?: number;
  latencyMs: number;
  ok: boolean;
  fellBack?: boolean;
  toolCallsDropped?: number;
};

/**
 * Logs one provider call: counts, cost and timing, never any text. A failed
 * write is swallowed, so logging can never break a person's request.
 */
export async function recordRun(run: RunRecord) {
  try {
    const tokensIn = run.tokensIn ?? 0;
    const tokensOut = run.tokensOut ?? 0;
    const cost = estimateCostUsd(
      run.model,
      tokensIn,
      tokensOut,
      run.cachedIn ?? 0,
    );
    await (await db()).insert(agentRun).values({
      userId: run.userId ?? null,
      purpose: run.purpose,
      model: run.model,
      tokensIn,
      tokensOut,
      latencyMs: Math.round(run.latencyMs),
      estCostUsd: cost === null ? null : cost.toFixed(6),
      ok: run.ok,
      fellBack: run.fellBack ?? false,
      toolCallsDropped: run.toolCallsDropped ?? 0,
      createdAt: new Date(),
    });
  } catch {
    // Deliberately silent: the log is a convenience, the request comes first.
  }
}

/**
 * Calls this person can still make today (UTC day). Every logged call counts,
 * including fallbacks and failures, because each one cost the provider a request.
 * If the count can't be read, the person is not blocked.
 */
export async function aiBudgetLeft(userId: string) {
  const limit = env().KOE_AI_DAILY_CALLS;
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [row] = await (
      await db()
    )
      .select({ n: count() })
      .from(agentRun)
      .where(and(eq(agentRun.userId, userId), gte(agentRun.createdAt, start)));
    return Math.max(0, limit - (row?.n ?? 0));
  } catch {
    return limit;
  }
}
