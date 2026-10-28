import "server-only";
import { z } from "zod";
import { eatingSafe, hasAiTell, stockPhrases } from "@/domain/interview-text";
import { detectRisk, mentionsContact } from "@/domain/safety";
import type { MessageView } from "../data/talk";
import { env } from "../env";
import { completeJson } from "./nebius";
import { system, version } from "./prompts/summaries";
import { talkStubbed } from "./talk-stub";

export const SUMMARY_PROMPT_VERSION = version;

// The risk rules read first-person words; takeaways are written as "You ...".
const firstPerson = (t: string) =>
  t
    .replace(/\byourself\b/gi, "myself")
    .replace(/\byour\b/gi, "my")
    .replace(/\byou\b/gi, "I");

// Loose on purpose: a reply that breaks the rules is dropped, not repaired.
const shape = z.object({ takeaways: z.array(z.string()) });

// Not the plan-item guardrails: those police Koe's own claims ("can fix"),
// while a takeaway repeats the person's words ("ask when they can fix it").
const clinical =
  /\b(diagnos\w*|depress\w*|anxi\w*|medicat\w*|medicine|pills?|dose|doses|antidepress\w*|suicid\w*|self[- ]?harm\w*|trauma\w*|therap\w*|psychiatr\w*|clinical\w*|disorder|symptoms?|treatment|cure)\b/i;
const harmful =
  /\b(fasting|calories|lose weight|restrict food|purge|weapon)\b/i;

/** Why a set of takeaways is refused, or null when every line passes. */
export function takeawayProblem(raw: unknown, eatingConcern: boolean) {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return "shape";
  const lines = parsed.data.takeaways.map((t) => t.trim());
  if (lines.length < 1 || lines.length > 3) return "count";
  for (const t of lines) {
    if (!t || t.length > 90) return "length";
    if (detectRisk(t) !== "none" || detectRisk(firstPerson(t)) !== "none")
      return "risk";
    if (mentionsContact(t)) return "contact";
    if (stockPhrases.test(t) || hasAiTell(t)) return "ai-tell";
    if (clinical.test(t) || harmful.test(t)) return "clinical";
    if (eatingConcern && !eatingSafe(t)) return "eating";
  }
  return null;
}

/** 1 to 3 takeaways that pass every check, or null: then nothing is stored. */
export function checkTakeaways(raw: unknown, eatingConcern: boolean) {
  if (takeawayProblem(raw, eatingConcern)) return null;
  return shape.parse(raw).takeaways.map((t) => t.trim());
}

/** One attempt at takeaways for a conversation. Any failure gives null. */
export async function summarise(
  messages: MessageView[],
  opts: { userId: string; eatingConcern: boolean },
): Promise<string[] | null> {
  const transcript = messages
    .filter((m) => m.role !== "safety")
    .slice(-30)
    .map((m) => `${m.role === "user" ? "Person" : "Koe"}: ${m.content}`)
    .join("\n");
  try {
    const raw = talkStubbed()
      ? { takeaways: ["You named what gets in the way."] }
      : env().KOE_AI === "off"
        ? null
        : await completeJson(
            [
              { role: "system", content: system() },
              { role: "user", content: transcript },
            ],
            shape,
            {
              purpose: "talk_summary",
              userId: opts.userId,
              model: env().KOE_FAST_MODEL,
              schemaName: "takeaways",
              temperature: 0.3,
              timeoutMs: 20_000,
            },
          );
    if (!raw) return null;
    const problem = takeawayProblem(raw, opts.eatingConcern);
    // Which check refused it, never the words.
    if (problem) console.warn(`talk_summary: nothing stored (${problem})`);
    return problem ? null : checkTakeaways(raw, opts.eatingConcern);
  } catch (error) {
    console.warn(
      `talk_summary: nothing stored (${error instanceof Error ? error.name : "error"})`,
    );
    return null;
  }
}
