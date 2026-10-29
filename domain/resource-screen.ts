import { z } from "zod";
import { goalPhrases, type Goal } from "./intake";
import { guardrailHits, mentionsExercise, mentionsFood } from "./plan-menu";
import { detectRisk, mentionsContact, normalise } from "./safety";
import {
  channelForAuthorUrl,
  sourceForUrl,
  videoUrl,
  youtubeHost,
  youtubeVideoId,
} from "./sources";
import type { ResourceTags } from "./resources";

// Public result data only: safe for the shared weekly cache. Older cache rows
// have no format and are articles.
export const publicResourceSchema = z.strictObject({
  title: z.string().trim().min(3).max(240),
  url: z.string().max(2048),
  host: z.string(),
  foodOrExercise: z.boolean(),
  adult: z.literal(true),
  aiScreened: z.boolean(),
  format: z.enum(["article", "video"]).optional(),
  videoId: z.string().max(11).optional(),
  /** oEmbed author_url of an allowlisted channel (videos only). */
  channel: z.string().max(200).optional(),
  readMinutes: z.number().int().min(1).max(120).optional(),
});
export type PublicResource = z.infer<typeof publicResourceSchema>;

/**
 * Where a result comes from: a validated HTTPS site, or for a video the
 * allowlisted channel that oEmbed named. Null when it is neither.
 */
export function resourceSource(r: {
  url: string;
  channel?: string | null;
}): { host: string; name: string; videoId?: string } | null {
  const id = youtubeVideoId(r.url);
  if (id) {
    const channel = channelForAuthorUrl(r.channel);
    return channel && r.url === videoUrl(id)
      ? { host: youtubeHost, name: channel.name, videoId: id }
      : null;
  }
  const site = sourceForUrl(r.url);
  return site ? { host: site.host, name: site.name } : null;
}

/** Whole words ÷ 230, rounded; only from known full text. */
export function readMinutes(text: string | undefined | null) {
  if (!text?.trim()) return undefined;
  const words = text.trim().split(/\s+/).length;
  return Math.min(120, Math.max(1, Math.round(words / 230)));
}

export function resourceRuleReason(
  hit: { title: string; url: string; content?: string; channel?: string },
  eatingConcern = false,
): string | null {
  if (!resourceSource(hit)) return "host";
  const path = normalise(decodePath(hit.url));
  const title = normalise(hit.title);
  if (
    /(?:^|[\s/_.-])(children|child|teens?|teenagers?|kids|adolescents?|youth|young[- ]people|parents?)(?:[\s/_.-]|$)/.test(
      path + " " + title,
    )
  )
    return "young audience";
  if (
    /(?:^|[\s/_.-])(login|signin|sign-in|signup|sign-up|register|cart|checkout|pricing|billing|coupon|affiliate|sponsored)(?:[\s/_.-]|$)/.test(
      path,
    )
  )
    return "commercial or utility page";
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
    /\b(buy now|add to cart|limited[- ]time offer|discount code|promo code|money-back|order now|book a free consultation)\b/i.test(
      text,
    )
  )
    return "commercial or sales page";
  if (
    /\b(you won't believe|one weird trick|number \d+ will shock|doctors hate)\b/i.test(
      text,
    )
  )
    return "low quality or clickbait";
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

/**
 * Why lines are fixed templates (D036), never model-written. A goal is named
 * only when the person chose it; a This week title or memory note only with
 * memory on.
 */
export const goalWhy = (
  tags: Pick<ResourceTags, "goal">,
  chosen: readonly Goal[] = [],
): string =>
  chosen.includes(tags.goal)
    ? `Because you chose "${goalPhrases[tags.goal]}"`
    : "";

export const weekWhy = (title: string | null | undefined): string =>
  title?.trim() ? `For "${title.trim()}"` : "";

export const noteWhy = (text: string | null | undefined): string => {
  const clean = text
    ?.trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  if (!clean) return "";
  const clipped =
    clean.length > 64 ? clean.slice(0, 61).trimEnd() + "…" : clean;
  return `Because you noted "${clipped}"`;
};

/** Cache data never bypasses today's quality rules, safety checks or local eating switch. */
export function cachedResourceOk(
  raw: unknown,
  eatingConcern: boolean,
  aiOn: boolean,
): raw is PublicResource {
  const r = publicResourceSchema.safeParse(raw);
  return (
    r.success &&
    resourceSource(r.data)?.host === r.data.host &&
    (r.data.format === "video") === !!r.data.videoId &&
    !resourceRuleReason(r.data, eatingConcern) &&
    !(eatingConcern && r.data.foodOrExercise) &&
    (!aiOn || r.data.aiScreened)
  );
}

const nonBookingHosts = [
  "wikipedia.org",
  "en.wikipedia.org",
  "reddit.com",
  "www.reddit.com",
  "bbc.co.uk",
  "www.bbc.co.uk",
  "bbc.com",
  "www.bbc.com",
  "verywellmind.com",
  "www.verywellmind.com",
  "helpguide.org",
  "www.helpguide.org",
  "mayoclinic.org",
  "www.mayoclinic.org",
  "clevelandclinic.org",
  "my.clevelandclinic.org",
  "health.harvard.edu",
  "www.health.harvard.edu",
  "medlineplus.gov",
  "sleepfoundation.org",
  "www.sleepfoundation.org",
];

/**
 * Scores how directly bookable/actionable an appointment hit is (practitioner
 * directory, self-referral portal, booking page, or 1-to-1 service vs article).
 */
export function appointmentBookableScore(hit: {
  title: string;
  url: string;
  content?: string;
}): number {
  const path = normalise(decodePath(hit.url));
  const title = normalise(hit.title);
  const body = normalise(hit.content ?? "");
  let score = 0;

  if (
    /\b(service-search|find[- ]a[- ](?:therapist|counsellor|counselor|tutor|adviser|advisor|coach|doctor|gp|clinic|service|psychologist|specialist|support)|find[- ]an[- ]nhs|directory|self-referral|self referral|refer yourself|book|booking|appointment\w*|schedule|consultation|register|tutors|tutoring|therapists|talking[- ]therapies|counsellors|counselors|counselling|counseling|advisers|advisors|coaching|clinic|sleep-center|debt-counseling|debt-advice|debt-and-money|career-services|contact-us|meetups?|groups?|clubs?|classes|courses?|workshops?|events?|join)\b/.test(
      `${title} ${path}`,
    )
  ) {
    score += 4;
  }
  if (
    /\b(refer yourself|book an? |schedule an? |speak with a trained adviser|find an? (?:accredited |registered |qualified |local |online |nhs )?(?:therapist|counsellor|counselor|tutor|adviser|advisor|coach|doctor|gp|clinic|service)|search for a |1-to-1|one-to-one|accredited register|free confidential|study sessions|join (?:a|our|the) |upcoming events?|meets (?:every|weekly|monthly)|sign up for)\b/.test(
      `${title} ${body}`,
    )
  ) {
    score += 2;
  }
  if (
    /(?:^|[\s/_.-])(articles?|blogs?|posts?|news|press|magazine|stories|podcasts?|videos?|publications?|fact-sheets?|factsheets?|feelings-symptoms-behaviours|self-help|tips|books|reading-list)(?:[\s/_.-]|$)/.test(
      path,
    )
  ) {
    score -= 6;
  }
  if (
    /^(how to |what is |what happens |why do |ways to |tips for |understanding |signs and symptoms |guide to )/i.test(
      hit.title.trim(),
    ) ||
    /\b(books|reading list|book list)\b/i.test(hit.title)
  ) {
    score -= 6;
  }
  return score;
}

/**
 * Screens a search hit for the Appointment lookup page: keeps real bookable
 * services, practitioner directories, and self-referral portals; rejects
 * informational Shelf articles, closed campus portals, unsafe pages, and crisis hotlines.
 */
export function appointmentRuleReason(
  hit: { title: string; url: string; content?: string },
  eatingConcern = false,
): string | null {
  const src = resourceSource(hit);
  if (!src || youtubeVideoId(hit.url)) return "host";
  if (
    nonBookingHosts.some((h) => src.host === h || src.host.endsWith(`.${h}`))
  ) {
    return "informational publisher";
  }
  if (/\.(edu|ac\.uk)$/i.test(src.host)) {
    return "campus-only portal";
  }
  const path = normalise(decodePath(hit.url));
  const title = normalise(hit.title);
  if (
    /(?:^|[\s/_.-])(children|child|teens?|teenagers?|kids|adolescents?|youth|young[- ]people|parents?)(?:[\s/_.-]|$)/.test(
      path + " " + title,
    )
  ) {
    return "young audience";
  }
  if (
    (/(?:^|[\s/_.-])(articles?|blogs?|posts?|news|press|magazine|stories|podcasts?|videos?|publications?|fact-sheets?|factsheets?|feelings-symptoms-behaviours|self-help|books|reading-list)(?:[\s/_.-]|$)/.test(
      path,
    ) &&
      !/\b(service-search|find-a-|directory|self-referral|booking)\b/.test(
        path,
      )) ||
    /^(how to |what is |what happens |why do |ways to |tips for |understanding |signs and symptoms |guide to )/i.test(
      hit.title.trim(),
    ) ||
    /\b(books|reading list|book list)\b/i.test(hit.title)
  ) {
    return "article or informational page";
  }
  const text = `${hit.title} ${hit.content ?? ""} ${path}`;
  if (detectRisk(text) !== "none") return "risk language";
  const hits = guardrailHits(text);
  if (
    hits.some((h) =>
      ["weight", "calories", "diet", "fasting", "skip meals"].includes(h),
    )
  ) {
    return "diet, weight or calories";
  }
  const topic = `${title} ${path}`;
  const cleanTopicForMed = topic
    .replace(/talking therapies medicine treatments/g, " ")
    .replace(
      /\b(behavioral sleep|sleep|family|internal|general) medicine\b/g,
      " ",
    );
  if (
    /\b(supplements?|pills?|tablets?|ssris?|snris?|dosage|doses?|milligrams?|\d+\s?mg|vitamins?)\b/i.test(
      text,
    ) ||
    /\b(medications?|medicines?|meds|antidepressants?)\b/i.test(
      cleanTopicForMed,
    )
  ) {
    return "medication, dosage or supplements";
  }
  if (
    /\b(crisis|helplines?|hotlines?|emergency[- ]?(numbers?|contacts?)|samaritans|988)\b/.test(
      topic,
    )
  ) {
    return "crisis or contact listing";
  }
  if (
    /\b(guarantee\w*|miracle|instant cure|doctors? (?:hide|won't tell)|shocking secret)\b/i.test(
      text,
    )
  ) {
    return "sensational claim";
  }
  if (
    /\b(will|is sure to) (definitely )?(make you feel better|help you feel better|cure|fix|lift your mood|boost your mood|improve your mood|reduce your (depression|symptoms))\b|\b(cures?|cure for) (depression|anxiety|low mood)\b/i.test(
      text,
    )
  ) {
    return "efficacy promise";
  }
  if (eatingConcern && (mentionsFood(text) || mentionsExercise(text))) {
    return "eating concern";
  }
  if (hit.content !== undefined && hit.content.trim().length < 50) {
    return "thin result";
  }
  if (appointmentBookableScore(hit) <= 0) {
    return "not a bookable service or directory";
  }
  return null;
}
