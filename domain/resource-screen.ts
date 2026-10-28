import { z } from "zod";
import { goalPhrases, type Goal } from "./intake";
import {
  breaksGuardrails,
  guardrailHits,
  mentionsExercise,
  mentionsFood,
} from "./plan-menu";
import { detectRisk, mentionsContact, normalise } from "./safety";
import { sourceForUrl } from "./sources";
import type { ResourceTags } from "./resources";

export const publicResourceSchema = z.strictObject({
  title: z.string().trim().min(3).max(240),
  url: z.string().max(2048),
  host: z.string(),
  foodOrExercise: z.boolean(),
  adult: z.literal(true),
  aiScreened: z.boolean(),
});
export type PublicResource = z.infer<typeof publicResourceSchema>;

export function resourceRuleReason(
  hit: { title: string; url: string; content?: string },
  eatingConcern = false,
): string | null {
  if (!sourceForUrl(hit.url)) return "host";
  const path = normalise(decodePath(hit.url));
  const title = normalise(hit.title);
  if (
    /(?:^|[\s/_.-])(children|child|teens?|teenagers?|kids|adolescents?|youth|young[- ]people|parents?)(?:[\s/_.-]|$)/.test(
      path + " " + title,
    )
  )
    return "young audience";
  const text = `${hit.title} ${hit.content ?? ""} ${path}`;
  if (detectRisk(text) !== "none") return "risk language";
  // External prose is not Koe's voice. Publisher pronouns, clinical research,
  // ordinary bedtime routines and advice to avoid alcohol are not copy bans.
  // Reuse only the planning guardrails that also ban the resource's subject.
  const hits = guardrailHits(text);
  if (
    hits.some((h) =>
      ["weight", "calories", "diet", "fasting", "skip meals"].includes(h),
    )
  )
    return "diet, weight or calories";
  if (
    hits.includes("supplement or medication") ||
    /\b(pills?|tablets?|ssris?|snris?|milligrams?|\d+\s?mg)\b/i.test(text)
  )
    return "medication, dosage or supplements";
  const topic = `${title} ${path}`;
  if (
    /\b(crisis|helplines?|hotlines?|emergency[- ]?(numbers?|contacts?))\b/.test(
      topic,
    ) ||
    mentionsContact(hit.title) ||
    /\b(crisis|helpline|hotline)\b.{0,60}\b(call|dial|text|phone|numbers?|\d{3,})\b/i.test(
      hit.content ?? "",
    )
  )
    return "crisis or contact listing";
  if (
    /\b(guarantee\w*|miracle|instant cure|doctors? (?:hide|won't tell)|shocking secret)\b/i.test(
      text,
    )
  )
    return "sensational claim";
  if (
    /\b(will|is sure to) (definitely )?(make you feel better|help you feel better|cure|fix|lift your mood|boost your mood|improve your mood|reduce your (depression|symptoms))\b|\b(cures?|cure for) (depression|anxiety|low mood)\b|\b(you'll|you will) (definitely |really |probably )?(feel better|enjoy|love)\b/i.test(
      text,
    )
  )
    return "efficacy promise";
  if (
    /\b(sleep restriction|sleep deprivation|cut(?:ting)? (?:down|back) on (?:your )?sleep|sleep (?:less|only) (?:than )?\d)\b/i.test(
      text,
    ) ||
    /(?:^|[.!?]\s+)(?:(?:you (?:should|can)|try to) )?(?:drink|use|take|have)\b.{0,25}\b(alcohol|wine|beer|vodka|whiskey)\b.{0,40}\b(sleep|mood)\b/i.test(
      hit.content ?? "",
    )
  )
    return "unsafe sleep or alcohol advice";
  if (eatingConcern && (mentionsFood(text) || mentionsExercise(text)))
    return "eating concern";
  if (hit.content !== undefined && hit.content.trim().length < 80)
    return "thin result";
  return null;
}

function decodePath(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}

export function whyOk(text: string, eatingConcern = false) {
  return (
    text.length <= 120 &&
    /\byou(r)?\b/i.test(text) &&
    text.split(/\s+/).length <= 18 &&
    !/\b(we|us|together|let's|i|me|my|mine|our|ours|step|steps)\b|!/i.test(
      text,
    ) &&
    !mentionsContact(text) &&
    !breaksGuardrails(text) &&
    detectRisk(text) === "none" &&
    !(eatingConcern && (mentionsFood(text) || mentionsExercise(text)))
  );
}

/**
 * Names the goal only when the person chose it in the intake. A default or
 * inferred goal gives no why line at all ("").
 */
export const templateWhy = (
  tags: ResourceTags,
  chosen: readonly Goal[] = [],
): string =>
  chosen.includes(tags.goal)
    ? `You chose ${goalPhrases[tags.goal]}. You might find ideas here.`
    : "";

/** A pick's why line: never claims a choice the person did not make. */
export function pickWhy(
  proposed: string | undefined,
  tags: ResourceTags,
  chosen: readonly Goal[],
  eatingConcern = false,
): string {
  const claims = /\byou (chose|picked|said)\b/i.test(proposed ?? "");
  return proposed &&
    whyOk(proposed, eatingConcern) &&
    (!claims || chosen.includes(tags.goal))
    ? proposed
    : templateWhy(tags, chosen);
}

/** Cache data never bypasses today's allowlist, rules or local eating switch. */
export function cachedResourceOk(
  raw: unknown,
  eatingConcern: boolean,
  aiOn: boolean,
): raw is PublicResource {
  const r = publicResourceSchema.safeParse(raw);
  return (
    r.success &&
    sourceForUrl(r.data.url)?.host === r.data.host &&
    !resourceRuleReason(r.data, eatingConcern) &&
    !(eatingConcern && r.data.foodOrExercise) &&
    (!aiOn || r.data.aiScreened)
  );
}
