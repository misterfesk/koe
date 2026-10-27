import { z } from "zod";
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
  sleep: "tips for sleeping better when feeling low",
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
    "self-help",
    "guide",
    "for",
    "adults",
    "with",
  ].flatMap((phrase) => phrase.split(" ")),
);

const has = <T extends object>(table: T, key: unknown): key is keyof T =>
  typeof key === "string" && Object.hasOwn(table, key);

export const resourceTagsSchema = z.strictObject({
  goal: z.enum(goals),
  interest: z.enum(resourceInterests).nullish(),
  format: z.enum(resourceFormats).nullish(),
  region: z.enum(["GB", "US", "AU", "global"]).nullish(),
});
export type ResourceTags = z.infer<typeof resourceTagsSchema>;

export function resourceTagsKey(input: ResourceTags): string {
  const t = resourceTagsSchema.parse(input);
  return [t.goal, t.interest ?? "", t.format ?? "", t.region ?? "global"].join(
    ":",
  );
}

/**
 * The exact query that would be sent. Only values from the fixed tables are
 * used; invalid tags are rejected before any external request.
 */
export function buildResourceQuery(tags: ResourceTags): string {
  tags = resourceTagsSchema.parse(tags);
  const parts: string[] = [];
  parts.push(has(goalWords, tags.goal) ? goalWords[tags.goal] : "low mood");
  if (has(interestWords, tags.interest))
    parts.push("with " + interestWords[tags.interest]);
  parts.push("practical self-help guide for adults");
  if (has(formatWords, tags.format)) parts.push(formatWords[tags.format]);
  return parts.join(" ");
}

export { goals as resourceGoals };
