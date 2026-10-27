// Operator-only live check. Reads local env without printing it. No user data.
export {};
// Stop the local app first when it uses the same PGlite database.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* exported env is also supported */
}
const { buildResourceQuery } = await import("../domain/resources");
const { orderedSources } = await import("../domain/sources");
const { searchWeb } = await import("../server/search/tavily");
const { screenResources } = await import("../server/search/screen");
const tags = { goal: "sleep", format: "article", region: "GB" } as const;
try {
  const hits = await searchWeb({
    query: buildResourceQuery(tags),
    includeDomains: orderedSources(tags.region).map((s) => s.host),
    maxResults: 6,
  });
  const { kept, rejected } = await screenResources(hits, tags);
  for (const r of kept) console.log(`KEEP ${r.host} | ${r.title} | ${r.why}`);
  for (const r of rejected)
    console.log(`DROP ${r.host} | ${r.title} | ${r.reason}`);
  console.log(
    `${kept.length} kept; ${rejected.length} dropped; 1 basic search call.`,
  );
  process.exit(0);
} catch {
  console.error(
    "Search smoke unavailable. Check provider settings and try again.",
  );
  process.exit(1);
}
