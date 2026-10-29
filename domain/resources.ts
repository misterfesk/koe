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

/**
 * This week topics (v3 A6). A Nano call classifies each This week thing into
 * one of these once, at week save. Only the enum, never the title, reaches a
 * query.
 */
export const weekTopics = [
  "work",
  "study",
  "home",
  "money",
  "people",
  "health_admin",
  "creative",
] as const;
export type WeekTopic = (typeof weekTopics)[number];

const weekTopicWords: Record<WeekTopic, string> = {
  work: "coping with work",
  study: "studying",
  home: "keeping on top of housework",
  money: "managing money worries",
  people: "keeping in touch with people",
  health_admin: "sorting out health appointments",
  creative: "creative hobbies",
};

const formatWords: Record<ResourceFormat, string> = {
  article: "article",
  // Allowlisted channel names (domain/sources.ts) roughly triple the hits that
  // pass the oEmbed channel check (live probe, 2026-10-28).
  video: "short video TED-Ed NHS Psych Hub Mind",
};

/** Every word a query can contain. Tests check queries against this list. */
export const queryVocabulary = new Set(
  [
    ...Object.values(goalWords),
    ...Object.values(interestWords),
    ...Object.values(formatWords),
    ...Object.values(weekTopicWords),
    "when feeling low",
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
  weekTopic: z.enum(weekTopics).nullish(),
});
export type ResourceTags = z.infer<typeof resourceTagsSchema>;

export function resourceTagsKey(input: ResourceTags): string {
  const t = resourceTagsSchema.parse(input);
  const key = [t.goal, t.interest ?? "", t.format ?? "", t.region ?? "global"];
  // Older keys have four parts; a week topic adds a fifth.
  if (t.weekTopic) key.push(t.weekTopic);
  return key.join(":");
}

/**
 * The exact query that would be sent. Only values from the fixed tables are
 * used; invalid tags are rejected before any external request.
 */
export function buildResourceQuery(tags: ResourceTags): string {
  tags = resourceTagsSchema.parse(tags);
  const parts: string[] = [];
  if (has(weekTopicWords, tags.weekTopic))
    parts.push(weekTopicWords[tags.weekTopic], "when feeling low");
  else
    parts.push(has(goalWords, tags.goal) ? goalWords[tags.goal] : "low mood");
  if (has(interestWords, tags.interest))
    parts.push("with " + interestWords[tags.interest]);
  parts.push("practical self-help guide for adults");
  if (has(formatWords, tags.format)) parts.push(formatWords[tags.format]);
  return parts.join(" ");
}

/** Parses a stored tags key; null when it no longer matches the schema. */
export function parseResourceTagsKey(key: string): ResourceTags | null {
  const [goal, interest, format, region, weekTopic] = key.split(":");
  const r = resourceTagsSchema.safeParse({
    goal,
    interest: interest || undefined,
    format: format || undefined,
    region: region || undefined,
    weekTopic: weekTopic || undefined,
  });
  return r.success ? r.data : null;
}

export { goals as resourceGoals };
