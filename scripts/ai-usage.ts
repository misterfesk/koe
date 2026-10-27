// Prints what the AI and search calls cost, from the agent_run log. Counts and
// money only: the log never holds prompts or replies.
//   npm run ai:usage
// With a file: DATABASE_URL, stop the dev server first (one process per database).
import { sql } from "drizzle-orm";
import { openDb } from "../server/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine when DATABASE_URL is already in the environment.
}

const windows = [
  { label: "last 24 hours", hours: 24 },
  { label: "last 7 days", hours: 24 * 7 },
];

const db = await openDb(process.env.DATABASE_URL ?? "file:./.data/pglite");
for (const w of windows) {
  const since = new Date(Date.now() - w.hours * 3_600_000).toISOString();
  const { rows } = await db.execute(sql`
    select purpose, model,
      count(*)::int as calls,
      coalesce(sum(tokens_in), 0)::int as tokens_in,
      coalesce(sum(tokens_out), 0)::int as tokens_out,
      coalesce(sum(est_cost_usd), 0)::float as cost_usd,
      count(*) filter (where fell_back)::int as fallbacks,
      count(*) filter (where not ok)::int as errors,
      coalesce(sum(tool_calls_dropped), 0)::int as tool_calls_dropped
    from agent_run
    where created_at >= ${since}::timestamp
    group by purpose, model
    order by purpose, model`);
  console.log(`\n${w.label}`);
  if (!rows.length) {
    console.log("  no calls");
    continue;
  }
  console.table(
    rows.map((r) => ({ ...r, cost_usd: Number(r.cost_usd).toFixed(4) })),
  );
  const sum = (key: string) =>
    rows.reduce((n, r) => n + Number((r as Record<string, unknown>)[key]), 0);
  console.log(
    `  total: ${sum("calls")} calls, ${sum("tokens_in")} in / ${sum("tokens_out")} out tokens, $${sum("cost_usd").toFixed(4)}, ${sum("fallbacks")} fallbacks, ${sum("errors")} errors`,
  );
}
process.exit(0);
