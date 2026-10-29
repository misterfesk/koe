import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  goalPhrases,
  liftLabels,
  type Goal,
  type IntakeModel,
} from "@/domain/intake";
import {
  appointmentBookableScore,
  appointmentRuleReason,
  goalWhy,
  noteWhy,
  resourceSource,
  weekWhy,
} from "@/domain/resource-screen";
import {
  intentTagsKey,
  sanitizeSearchQuery,
  weekTopics,
  type ResourceFormat,
  type ResourceTags,
  type WeekTopic,
} from "@/domain/resources";
import { firstTakeaways, listConversations } from "../data/talk";
import { listPeople } from "../data/people";
import { getCheckIn } from "../data/profile";
import { getUserModel } from "../data/intake";
import { weekThingStates } from "../data/week";
import { env } from "../env";
import { buildContext } from "../llm/context";
import { completeJson } from "../llm/nebius";
import { talkStubbed } from "../llm/talk-stub";
import type { Viewer } from "../viewer";
import { searchStubbed } from "./stub";
import { searchEnabled, searchWeb } from "./tavily";

export type PlannedSearch = {
  tags: ResourceTags;
  tagsKey: string;
  query: string;
  why: string;
  custom: boolean;
};

type CandidateSource = {
  id: string;
  kind:
    | "instruction"
    | "week_task"
    | "today_item"
    | "memory"
    | "note"
    | "talk"
    | "interest"
    | "goal";
  text: string;
  why: string;
  goal: Goal;
  weekTopic?: WeekTopic;
};

const intentItemSchema = z.object({
  sourceId: z.string(),
  query: z.string().min(3).max(90),
  format: z.enum(["article", "video"]),
  weekTopic: z.enum(weekTopics).optional(),
});

const intentsSchema = z.object({
  intents: z.array(intentItemSchema).min(1).max(4),
});

function slugHash(query: string): string {
  return createHash("sha256")
    .update(query.toLowerCase().trim())
    .digest("hex")
    .slice(0, 10);
}

function instructionWhy(text: string): string {
  const clean = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  if (!clean) return "";
  const clipped =
    clean.length > 56 ? clean.slice(0, 53).trimEnd() + "…" : clean;
  return `Because you asked for "${clipped}"`;
}

async function collectCandidateSources(input: {
  v: Viewer;
  eatingConcern: boolean;
  model?: IntakeModel;
  things?: { topic: WeekTopic; title: string }[];
  instructions?: string;
}) {
  const { v, eatingConcern, model, things = [], instructions } = input;
  const [packet, weekStates, convos, people, energy] = await Promise.all([
    buildContext(v.db, v.user.id, v.today),
    weekThingStates(v.db, v.user.id, v.today),
    listConversations(v.db, v.user.id),
    listPeople(v.db, v.user.id),
    getCheckIn(v.db, v.user.id, v.today),
  ]);
  const takeawayMap = await firstTakeaways(
    v.db,
    v.user.id,
    convos.slice(0, 3).map((c) => c.id),
  );
  const takeaways = [...takeawayMap.values()];

  const defaultGoal: Goal = model?.goals?.[0] ?? "through_day";
  const candidates: CandidateSource[] = [];
  const rawUserTexts: string[] = [];

  if (instructions?.trim()) {
    const cleanInst = instructions.trim();
    rawUserTexts.push(cleanInst);
    candidates.push({
      id: "S0",
      kind: "instruction",
      text: cleanInst,
      why: instructionWhy(cleanInst),
      goal: defaultGoal,
    });
  }

  const addCandidate = (c: Omit<CandidateSource, "id">) => {
    if (!c.text.trim()) return;
    const nextIndex = candidates.filter((x) => x.id !== "S0").length + 1;
    candidates.push({ ...c, id: `S${nextIndex}` });
  };

  // 1. Weekly things (with topic when classified)
  for (const w of weekStates.filter((t) => !t.done)) {
    const matchedTopic =
      things.find((t) => t.title === w.title)?.topic ?? "work";
    rawUserTexts.push(w.title, w.what);
    addCandidate({
      kind: "week_task",
      text: w.what && w.what !== w.title ? `${w.title} (${w.what})` : w.title,
      why: weekWhy(w.title),
      goal: "work_study",
      weekTopic: matchedTopic,
    });
  }
  for (const t of things) {
    if (!candidates.some((c) => c.why === weekWhy(t.title))) {
      rawUserTexts.push(t.title);
      addCandidate({
        kind: "week_task",
        text: t.title,
        why: weekWhy(t.title),
        goal: "work_study",
        weekTopic: t.topic,
      });
    }
  }

  // 2. Putting off & intake notes
  if (model?.puttingOff?.trim()) {
    rawUserTexts.push(model.puttingOff);
    addCandidate({
      kind: "week_task",
      text: model.puttingOff.trim(),
      why: weekWhy(model.puttingOff.trim()),
      goal: "work_study",
      weekTopic: "work",
    });
  }
  for (const noteText of Object.values(model?.notes ?? {})) {
    if (typeof noteText === "string" && noteText.trim()) {
      rawUserTexts.push(noteText);
      addCandidate({
        kind: "note",
        text: noteText.trim(),
        why: noteWhy(noteText.trim()),
        goal: defaultGoal,
      });
    }
  }

  // 3. Today's plan items
  for (const item of packet.today?.items ?? []) {
    if (item.title?.trim()) {
      rawUserTexts.push(item.title);
      addCandidate({
        kind: "today_item",
        text: item.title.trim(),
        why: weekWhy(item.title.trim()),
        goal: defaultGoal,
      });
    }
  }

  // 4. Memory cards & recent notes
  for (const m of (packet.memories ?? []).slice(-6)) {
    rawUserTexts.push(m.text);
    addCandidate({
      kind: "memory",
      text: m.text,
      why: noteWhy(m.text),
      goal: m.kind === "helps" ? "enjoy_again" : defaultGoal,
    });
  }
  for (const n of (packet.notes ?? []).slice(-4)) {
    rawUserTexts.push(n.text);
    addCandidate({
      kind: "note",
      text: n.text,
      why: noteWhy(n.text),
      goal: defaultGoal,
    });
  }

  // 5. Recent Talk takeaways
  for (const text of takeaways.slice(0, 2)) {
    rawUserTexts.push(text);
    addCandidate({
      kind: "talk",
      text,
      why: noteWhy(text),
      goal: defaultGoal,
    });
  }

  // 6. Chosen lifts & goals
  for (const lift of model?.lifts ?? []) {
    if (lift === "other") continue;
    if (eatingConcern && ["walking", "cooking"].includes(lift)) continue;
    addCandidate({
      kind: "interest",
      text: liftLabels[lift],
      why: `Because you mentioned ${liftLabels[lift]}`,
      goal: "enjoy_again",
    });
  }
  for (const goal of model?.goals ?? []) {
    addCandidate({
      kind: "goal",
      text: goalPhrases[goal],
      why: goalWhy({ goal }, model?.goals ?? []),
      goal,
    });
  }

  if (packet.summary) rawUserTexts.push(packet.summary);

  const forbiddenNames = [
    ...(model?.names?.map((n) => n.name) ?? []),
    ...people.map((p) => p.name),
  ];

  return {
    packet,
    energy: energy ?? packet.today?.mode ?? "normal",
    candidates,
    rawUserTexts,
    forbiddenNames,
  };
}

/**
 * Turns what Koe knows about the person (weekly things, today's plan, memory
 * cards, notes, intake, Talk takeaways) into 3–4 privacy-safe search intents.
 * Returns null when memory is off, AI is off, or the model cannot produce
 * valid intents, so callers fall back to deterministic tag queries.
 */
export async function planPersonalizedSearches(input: {
  v: Viewer;
  region: "GB" | "US" | "AU" | "global";
  eatingConcern: boolean;
  memoryOn: boolean;
  model?: IntakeModel;
  things: { topic: WeekTopic; title: string }[];
  dislikedKeys: Set<string>;
  maxIntents: number;
}): Promise<PlannedSearch[] | null> {
  const {
    v,
    region,
    eatingConcern,
    memoryOn,
    model,
    things,
    dislikedKeys,
    maxIntents,
  } = input;
  if (!memoryOn || env().KOE_AI !== "on" || searchStubbed()) return null;

  const { energy, candidates, rawUserTexts, forbiddenNames } =
    await collectCandidateSources({ v, eatingConcern, model, things });

  // Only call the intent model when the user has concrete personal context
  // beyond bare intake enum tags (tasks, memories, notes, takeaways, or today's plan).
  const hasRichSignal = candidates.some((c) =>
    ["week_task", "today_item", "memory", "note", "talk"].includes(c.kind),
  );
  if (!hasRichSignal) return null;

  try {
    const raw = await completeJson(
      [
        {
          role: "system",
          content: `You plan 3 to 4 web search queries to find genuinely useful resources (practical guides, study or work tools, tutorials, courses, articles, communities or educational videos) for an adult's week.
Rules:
- Start from the user's numbered sources (tasks, memories, notes, today's plan, interests, goals) and current energy.
- Pick a balanced mix: practical help for their concrete tasks or skills (e.g. "SAT algebra practice problems guide", "writing a software resume guide"), resources for their interests or what helps them unwind, and support for their energy or routine.
- Include at least one "article" and, when helpful, one "video" (for YouTube channels like Khan Academy, TED-Ed, CrashCourse, 3Blue1Brown, freeCodeCamp, Mind, NHS).
- Privacy: abstract every query into a generic 3 to 8 word topic search. NEVER include personal names, employer names, locations, usernames, or verbatim multi-word sentences from the user's text.
- Safety: never search for diets, calories, weight loss, fasting, supplements, medication, dosages, or crisis/self-harm topics.${eatingConcern ? " Never search for food, cooking, nutrition, running, workouts, or exercise." : ""}
- Each intent must reference the exact sourceId (e.g. "S1") it supports. Reply with JSON only.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            energy,
            sources: candidates.map((c) => ({
              sourceId: c.id,
              kind: c.kind,
              text: c.text.slice(0, 140),
              ...(c.weekTopic ? { weekTopic: c.weekTopic } : {}),
            })),
          }),
        },
      ],
      intentsSchema,
      {
        purpose: "shelf_intents",
        model: env().KOE_FAST_MODEL,
        userId: v.user.id,
        temperature: 0.2,
        maxTokens: 260,
        timeoutMs: 8000,
      },
    );

    const parsed = intentsSchema.safeParse(raw);
    if (!parsed.success) return null;

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const out: PlannedSearch[] = [];
    const seenQueries = new Set<string>();

    for (const item of parsed.data.intents) {
      if (out.length >= maxIntents) break;
      const source = byId.get(item.sourceId) ?? candidates[0];
      if (!source) continue;
      const cleanQuery = sanitizeSearchQuery(item.query, {
        eatingConcern,
        forbiddenNames,
        rawUserTexts,
      });
      if (!cleanQuery) continue;
      const format: ResourceFormat = item.format;
      const query =
        format === "video" &&
        !/\b(TED|NHS|Mind|Khan|CrashCourse|freeCodeCamp|3Blue1Brown)\b/i.test(
          cleanQuery,
        )
          ? `${cleanQuery} TED-Ed Khan Academy Mind NHS`
          : cleanQuery;
      const norm = `${format}:${query.toLowerCase()}`;
      if (seenQueries.has(norm)) continue;
      seenQueries.add(norm);

      const weekTopic =
        source.weekTopic ??
        (source.kind === "week_task" ? (item.weekTopic ?? "work") : undefined);
      const tags: ResourceTags = {
        goal: source.goal,
        format,
        region,
        ...(weekTopic ? { weekTopic } : {}),
      };
      const tagsKey = intentTagsKey(tags, slugHash(query));
      if (dislikedKeys.has(tagsKey)) continue;

      out.push({
        tags,
        tagsKey,
        query,
        why: source.why,
        custom: true,
      });
    }

    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// --- Appointment Lookup Pipeline ---

const appointmentCategories = [
  "talking_therapy",
  "counselling",
  "gp",
  "sleep_support",
  "tutor",
  "career_support",
  "money_advice",
  "community_support",
] as const;
type AppointmentCategory = (typeof appointmentCategories)[number];

const categoryLabels: Record<AppointmentCategory, string> = {
  talking_therapy: "Talking therapy",
  counselling: "Counselling",
  gp: "GP or family doctor",
  sleep_support: "Sleep support",
  tutor: "Tutoring and study support",
  career_support: "Work and career advice",
  money_advice: "Money and debt advice",
  community_support: "Community support",
};

const regionWord: Record<"GB" | "US" | "AU" | "global", string> = {
  GB: "UK NHS",
  US: "US",
  AU: "Australia",
  global: "online",
};

function fallbackCategoryQuery(
  cat: AppointmentCategory,
  region: "GB" | "US" | "AU" | "global",
): string {
  const r = regionWord[region];
  switch (cat) {
    case "talking_therapy":
      return region === "GB"
        ? "NHS talking therapies service search self referral book"
        : region === "AU"
          ? "Medicare Mental Health find a service book appointment Australia"
          : `Psychology Today find a CBT therapist directory book appointment ${r}`;
    case "counselling":
      return region === "GB"
        ? "BACP Counselling Directory find a therapist UK book appointment"
        : region === "AU"
          ? "Australian Counselling Association find a registered counsellor directory"
          : `Psychology Today find a counselor therapist directory book ${r}`;
    case "gp":
      return region === "GB"
        ? "NHS find a GP surgery register book appointment"
        : region === "AU"
          ? "healthdirect find a GP book doctor appointment Australia"
          : `find a primary care doctor book appointment online ${r}`;
    case "sleep_support":
      return region === "GB"
        ? "NHS talking therapies service search CBT insomnia referral UK"
        : `CBT-I insomnia specialist directory sleep clinic book appointment ${r}`;
    case "tutor":
      return region === "GB"
        ? "Superprof First Tutors find a one to one tutor UK book lesson"
        : `Wyzant find a college tutor book one to one study session ${r}`;
    case "career_support":
      return region === "GB"
        ? "National Careers Service book a career adviser appointment UK"
        : `book one to one career coach CV adviser appointment ${r}`;
    case "money_advice":
      return region === "GB"
        ? "StepChange Citizens Advice book free debt adviser appointment UK"
        : `NFCC GreenPath book free confidential debt counselor appointment ${r}`;
    case "community_support":
      return region === "GB"
        ? "Mind local Minds service finder support group UK"
        : `NAMI adult mental health support group finder register ${r}`;
  }
}

const categorySubjectPattern: Record<AppointmentCategory, RegExp> = {
  talking_therapy:
    /\b(therap\w*|cbt|talking|counsell\w*|counsel\w*|psycholog\w*)\b/i,
  counselling: /\b(counsell\w*|counsel\w*|therap\w*|bacp|psycholog\w*)\b/i,
  gp: /\b(gp|doctor\w*|primary care|medical|surgery|clinic|physician)\b/i,
  sleep_support: /\b(sleep|insomnia|cbt-i|cbti)\b/i,
  tutor:
    /\b(tutor\w*|math\w*|calculus|algebra|study|academic|coach\w*|lesson\w*|exam\w*)\b/i,
  career_support:
    /\b(career\w*|cv|resume|job\w*|work|interview\w*|employ\w*)\b/i,
  money_advice:
    /\b(debt\w*|money|financial|budget\w*|stepchange|citizens advice|nfcc|greenpath|bills?)\b/i,
  community_support:
    /\b(support group\w*|peer support|mind|nami|community|mental health)\b/i,
};

function ensureBookingIntentQuery(
  query: string,
  category: AppointmentCategory,
  region: "GB" | "US" | "AU" | "global",
): string {
  let q = query.trim();
  if (!categorySubjectPattern[category].test(q)) {
    return fallbackCategoryQuery(category, region);
  }
  if (
    !/\b(book|booking|appointment\w*|directory|referral|service-search|find a|register|consultation|tutors|therapists|counsellors|counselors|advisers|advisors|clinic)\b/i.test(
      q,
    )
  ) {
    q = `${q} book appointment`;
  }
  if (region === "GB" && !/\b(uk|nhs|britain|england|bacp)\b/i.test(q)) {
    q = `${q} UK`;
  } else if (region === "AU" && !/\b(australia|australian)\b/i.test(q)) {
    q = `${q} Australia`;
  }
  return q;
}

const appointmentIntentSchema = z.object({
  intents: z
    .array(
      z.object({
        sourceId: z.string(),
        category: z.enum(appointmentCategories),
        query: z.string().min(3).max(80),
      }),
    )
    .min(1)
    .max(3),
});

export type AppointmentResult = {
  title: string;
  url: string;
  sourceName: string;
  why: string;
};

type PlannedAppointment = {
  category: AppointmentCategory;
  query: string;
  why: string;
};

function composeAppointmentWhy(
  category: AppointmentCategory,
  sourceWhy: string,
): string {
  const label = categoryLabels[category];
  return sourceWhy ? `${label} · ${sourceWhy}` : label;
}

function deterministicAppointmentPlans(
  candidates: CandidateSource[],
  region: "GB" | "US" | "AU" | "global",
): PlannedAppointment[] {
  const out: PlannedAppointment[] = [];
  const add = (category: AppointmentCategory, sourceWhy: string) => {
    if (out.some((p) => p.category === category)) return;
    out.push({
      category,
      query: fallbackCategoryQuery(category, region),
      why: composeAppointmentWhy(category, sourceWhy),
    });
  };

  for (const c of candidates) {
    if (out.length >= 3) break;
    const t = c.text.toLowerCase();
    if (
      /\b(tutor\w*|math\w*|algebra|calculus|physics|chemistry|exam\w*|sat\b|study|studying|course\w*|homework|essay|university|college)\b/.test(
        t,
      ) ||
      c.weekTopic === "study"
    ) {
      add("tutor", c.why);
    } else if (
      /\b(debt\w*|money|bills?|rent|budget\w*|loan\w*|overdue|tax\w*|financial)\b/.test(
        t,
      ) ||
      c.weekTopic === "money"
    ) {
      add("money_advice", c.why);
    } else if (
      /\b(cv\b|resume|job\w*|career\w*|interview\w*|work\b|manager|office)\b/.test(
        t,
      ) ||
      c.weekTopic === "work"
    ) {
      add("career_support", c.why);
    } else if (
      /\b(sleep\w*|insomnia|awake|waking|tired|bedtime)\b/.test(t) ||
      c.goal === "sleep"
    ) {
      add("sleep_support", c.why);
    } else if (/\b(gp\b|doctor\w*|medical|clinic|checkup)\b/.test(t)) {
      add("gp", c.why);
    } else if (/\b(counsell\w*|therap\w*|cbt\b|psycholog\w*)\b/.test(t)) {
      add("counselling", c.why);
    } else if (c.goal === "less_alone" || c.weekTopic === "people") {
      add("community_support", c.why);
    }
  }

  const defaultWhy =
    candidates.find((c) => c.why)?.why ??
    `Because you chose "${goalPhrases.through_day}"`;
  if (out.length < 2) add("talking_therapy", defaultWhy);
  if (out.length < 2) add("counselling", defaultWhy);
  return out.slice(0, 3);
}

/**
 * Uses what Koe knows about the user (plus optional instructions) so a Nebius
 * model can decide what professional help or bookable services fit their needs
 * and region, scrubs all queries for privacy, and searches via Tavily.
 */
export async function lookupAppointmentHelp(input: {
  v: Viewer;
  instructions?: string;
}): Promise<{
  ok: boolean;
  results: AppointmentResult[];
  unavailable?: boolean;
}> {
  const { v, instructions } = input;
  if (!searchEnabled()) {
    return { ok: false, results: [], unavailable: true };
  }

  const rawRegion = v.profile.region;
  const region: "GB" | "US" | "AU" | "global" =
    rawRegion === "GB" || rawRegion === "US" || rawRegion === "AU"
      ? rawRegion
      : "global";
  const memoryOn = v.profile.memoryOn ?? true;
  const savedModel = memoryOn ? await getUserModel(v.db, v.user.id) : undefined;
  const model = savedModel?.model;
  const eatingConcern = Boolean(model?.eatingConcern);

  const { energy, candidates, rawUserTexts, forbiddenNames } = memoryOn
    ? await collectCandidateSources({
        v,
        eatingConcern,
        model,
        instructions,
      })
    : {
        energy: "normal",
        candidates: instructions?.trim()
          ? [
              {
                id: "S0",
                kind: "instruction" as const,
                text: instructions.trim(),
                why: instructionWhy(instructions.trim()),
                goal: "through_day" as Goal,
              },
            ]
          : [],
        rawUserTexts: instructions?.trim() ? [instructions.trim()] : [],
        forbiddenNames: [] as string[],
      };

  let plans: PlannedAppointment[] = [];
  const aiOn = env().KOE_AI === "on" && !talkStubbed();

  if (aiOn && candidates.length > 0) {
    try {
      const raw = await completeJson(
        [
          {
            role: "system",
            content: `You help an adult find REAL BOOKABLE SERVICES, PRACTITIONER DIRECTORIES, OR SELF-REFERRAL PORTALS that fit their needs and region (${region}). Never search for informational articles, tips, blogs, or reading guides (those belong on the reading Shelf).
Available categories:
- "talking_therapy": NHS talking therapies service search / self-referral, CBT therapist booking directories
- "counselling": accredited counselling directories (BACP, Counselling Directory, Psychology Today), therapist booking portals
- "gp": GP / primary care doctor registration and online appointment booking
- "sleep_support": sleep clinics, CBT-I insomnia specialist directories and referrals
- "tutor": 1-to-1 subject tutoring booking platforms (Wyzant, Superprof, First Tutors), academic coaching sessions
- "career_support": 1-to-1 career adviser booking (National Careers Service, career coaching appointments)
- "money_advice": free confidential debt/money adviser booking (StepChange, Citizens Advice, GreenPath, NFCC)
- "community_support": local mental health service finders and peer support group registration

Rules:
- Choose 2 to 3 intents that best match the user's numbered sources.
- If source "S0" (kind "instruction") is present, your first intent MUST directly serve "S0".
- Every query MUST include booking, referral, or directory terms such as "service search self referral", "find a therapist directory book", "find a tutor book session", "book adviser appointment", or "find a clinic".
- Tailor queries to region "${region}" (e.g. NHS service search, BACP, Counselling Directory, StepChange, Citizens Advice, National Careers Service, Superprof for GB; Psychology Today, Wyzant, NFCC, GreenPath for US; healthdirect, Medicare Mental Health, National Debt Helpline for AU).
- Privacy: abstract every query into a generic 4 to 8 word booking/directory search. NEVER copy 4 or more consecutive words from any source or instruction, and never include personal names, employer names, or private details.
- Safety: never search for diets, weight loss, calories, supplements, medication, dosages, or crisis/self-harm hotlines.${eatingConcern ? " Never search for food, cooking, nutrition, or exercise." : ""}
- Reply with JSON only.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              region,
              energy,
              sources: candidates.map((c) => ({
                sourceId: c.id,
                kind: c.kind,
                text: c.text.slice(0, 140),
              })),
            }),
          },
        ],
        appointmentIntentSchema,
        {
          purpose: "shelf_intents",
          model: env().KOE_FAST_MODEL,
          userId: v.user.id,
          temperature: 0.2,
          maxTokens: 240,
          timeoutMs: 8000,
        },
      );

      const parsed = appointmentIntentSchema.safeParse(raw);
      if (parsed.success) {
        const byId = new Map(candidates.map((c) => [c.id, c]));
        const seen = new Set<string>();
        for (const item of parsed.data.intents) {
          const source = byId.get(item.sourceId) ?? candidates[0];
          if (!source) continue;
          const baseQuery =
            sanitizeSearchQuery(item.query, {
              eatingConcern,
              forbiddenNames,
              rawUserTexts,
            }) ?? fallbackCategoryQuery(item.category, region);
          const cleanQuery = ensureBookingIntentQuery(
            baseQuery,
            item.category,
            region,
          );
          const norm = cleanQuery.toLowerCase();
          if (seen.has(norm)) continue;
          seen.add(norm);
          plans.push({
            category: item.category,
            query: cleanQuery,
            why: composeAppointmentWhy(item.category, source.why),
          });
        }
      }
    } catch {
      // Fall back to deterministic plans below if the model call fails.
    }
  }

  if (plans.length === 0) {
    plans = deterministicAppointmentPlans(candidates, region);
  }

  try {
    let anySucceeded = false;
    const batches = await Promise.all(
      plans.slice(0, 3).map(async (plan) => {
        try {
          const hits = await searchWeb({
            query: plan.query,
            maxResults: 6,
            rawContent: false,
            userId: v.user.id,
            database: v.db,
          });
          anySucceeded = true;
          const screened = hits
            .filter((hit) => !appointmentRuleReason(hit, eatingConcern))
            .sort(
              (a, b) =>
                appointmentBookableScore(b) - appointmentBookableScore(a),
            );
          return { plan, hits: screened };
        } catch {
          return { plan, hits: [] };
        }
      }),
    );
    if (!anySucceeded) {
      return { ok: false, results: [], unavailable: true };
    }

    const results: AppointmentResult[] = [];
    const seenUrls = new Set<string>();

    // Interleave hits across the planned service intents so results cover each matched need.
    const maxLen = Math.max(0, ...batches.map((b) => b.hits.length));
    for (let i = 0; i < maxLen && results.length < 6; i++) {
      for (const { plan, hits } of batches) {
        if (results.length >= 6) break;
        const hit = hits[i];
        if (!hit) continue;
        const src = resourceSource(hit);
        if (!src) continue;
        let cleanUrl: string;
        try {
          cleanUrl = new URL(hit.url).href;
        } catch {
          continue;
        }
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        results.push({
          title: hit.title.trim().slice(0, 180),
          url: cleanUrl,
          sourceName: src.name,
          why: plan.why,
        });
      }
    }

    return { ok: true, results };
  } catch {
    return { ok: false, results: [], unavailable: true };
  }
}
