import { goals, lifts, type Goal, type Lift } from "./intake";

// Web search for the Shelf and for "find me something to read" in Talk.
// Tavily may keep and train on queries, so a query is built here from fixed
// phrases keyed by enum tags and nothing else: no word the person wrote can
// reach it (plan/product-v2.md, "Privacy rule for web search").

export const resourceFormats = ["article", "video"] as const;
export type ResourceFormat = (typeof resourceFormats)[number];

/** Interests the search may use: the intake lifts, without the open-ended "other". */
export const resourceInterests = lifts.filter(
  (l): l is Exclude<Lift, "other"> => l !== "other",
);

const goalWords: Record<Goal, string> = {
  through_day: "getting through the day with low mood",
  sleep: "sleep and low mood",
  energy: "low energy and low mood",
  less_alone: "feeling less alone with low mood",
  enjoy_again: "enjoying things again with low mood",
  work_study: "work or study with low mood",
  basics: "looking after the basics with low mood",
};

const interestWords: Record<Exclude<Lift, "other">, string> = {
  music: "music",
  walking: "walking",
  cooking: "cooking",
  games: "games",
  pets: "pets",
  outdoors: "being outdoors",
  making: "making things",
  faith: "faith",
  reading: "reading",
  shows: "watching shows",
};

const formatWords: Record<ResourceFormat, string> = {
  article: "article",
  video: "short video",
};

/** Every word a query can contain. Tests check queries against this list. */
export const queryVocabulary = new Set(
  [
    ...Object.values(goalWords),
    ...Object.values(interestWords),
    ...Object.values(formatWords),
    "practical",
    "guide",
    "with",
  ].flatMap((phrase) => phrase.split(" ")),
);

const has = <T extends object>(table: T, key: unknown): key is keyof T =>
  typeof key === "string" && Object.hasOwn(table, key);

export type ResourceTags = {
  goal: Goal;
  interest?: Lift | null;
  format?: ResourceFormat | null;
};

/**
 * The exact query that would be sent. Only values from the fixed tables are
 * used; anything else (including a stray string) is ignored.
 */
export function buildResourceQuery(tags: ResourceTags): string {
  const parts: string[] = [];
  parts.push(has(goalWords, tags.goal) ? goalWords[tags.goal] : "low mood");
  if (has(interestWords, tags.interest))
    parts.push("with " + interestWords[tags.interest]);
  parts.push("practical guide");
  if (has(formatWords, tags.format)) parts.push(formatWords[tags.format]);
  return parts.join(" ");
}

export { goals as resourceGoals };
