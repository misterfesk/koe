import { z } from "zod";
import {
  introduces,
  itemTextOk,
  smallerVersion,
  type DayItem,
} from "./day-plan";
import { goals, type IntakeModel } from "./intake";
import {
  contextFor,
  LAST_MINUTE,
  mentionsExercise,
  mentionsFood,
  planKinds,
  planSizes,
  type PlanKind,
} from "./plan-menu";
import {
  buildResourceQuery,
  resourceFormats,
  resourceInterests,
} from "./resources";
import { detectRisk, mentionsContact } from "./safety";

// Talk's tools. A tool call is only ever a proposal: it becomes a card the
// person confirms or dismisses, and nothing is written until they confirm.
// Everything here is pure: the schemas the model sees, the checks that decide
// whether a call becomes a card, and the plain lines shown on a card.
// UNREVIEWED: engineering defaults; a clinician has not reviewed the wording.

export const toolNames = [
  "add_item",
  "move_item",
  "shrink_item",
  "set_reminder",
  "save_memory",
  "find_resources",
  "draft_message",
  "prepare_appointment",
] as const;
export type ToolName = (typeof toolNames)[number];

/** No card in one reply is worth more than two: Koe listens first. */
export const MAX_CARDS = 2;
/** The earliest a time Talk proposes may be (05:00); catches "17" for "17:00". */
export const EARLIEST_MINUTE = 5 * 60;

const itemId = z.string().trim().min(1).max(64);
const minute = z.number().int().min(0).max(1439);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const toolSchemas = {
  add_item: z.object({
    kind: z.enum(planKinds),
    title: z.string().trim().min(3).max(80),
    size: z.enum(planSizes),
    minuteOfDay: minute.nullish(),
    why: z.string().trim().min(3).max(120).nullish(),
  }),
  move_item: z.object({ itemId, minuteOfDay: minute }),
  shrink_item: z.object({
    itemId,
    smallerTitle: z.string().trim().min(3).max(80).nullish(),
  }),
  set_reminder: z
    .object({ itemId: itemId.nullish(), morningPlan: clock.nullish() })
    .refine((a) => !!a.itemId !== !!a.morningPlan, {
      message: "Give either itemId or morningPlan.",
    }),
  save_memory: z.object({
    kind: z.enum(["helps", "hard", "people", "preference"]),
    text: z.string().trim().min(3).max(120),
  }),
  find_resources: z.object({
    goal: z.enum(goals),
    interest: z.enum(resourceInterests).nullish(),
    format: z.enum(resourceFormats).nullish(),
  }),
  draft_message: z.object({
    personId: itemId,
    draft: z.string().trim().min(3).max(300),
  }),
  prepare_appointment: z.object({}),
} satisfies Record<ToolName, z.ZodType>;

export const toolDescriptions: Record<ToolName, string> = {
  add_item:
    "Propose adding one small thing to today's plan. Use only when the person asked for it or clearly would benefit. size is tiny, small or medium. minuteOfDay is minutes after midnight (5pm is 1020); leave it out if no time was asked for.",
  move_item:
    "Propose moving one of today's items to a new time. itemId must be an id from today.items. minuteOfDay is minutes after midnight (5pm is 1020).",
  shrink_item:
    "Propose making one of today's items smaller. itemId must be an id from today.items. smallerTitle is optional: a smaller version of the same thing, starting with a verb.",
  set_reminder:
    "Propose a reminder, either for one of today's items (itemId from today.items) or for the daily morning plan reminder (morningPlan as HH:MM, 24-hour). Give exactly one of the two.",
  save_memory:
    "Propose saving one lasting, ordinary fact the person said about themselves, in second person and in under 120 characters. Never health, diagnoses, medication, self-harm, trauma or private details of others.",
  find_resources:
    "Propose looking for something to read or watch on the person's Shelf. Choose only from the listed values; never put the person's own words in. The person sees the exact search before it runs.",
  draft_message:
    "Propose a short message for the person to send to someone in their corner (personId from people). Write it in the person's voice, under 300 characters. Koe never sends it.",
  prepare_appointment:
    "Propose putting together notes for an appointment with a doctor or another professional.",
};

// --- What is stored -------------------------------------------------------------

export type ToolStatus = "pending" | "done" | "dismissed";

/** Facts looked up when the card was made, so it can say what it is about. */
export type ToolMeta = {
  /** The title of the plan item or the name of the person. */
  title?: string;
  /** For a move: where it is now. */
  from?: number;
  channel?: string;
};

export type ToolProposal = {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  status: ToolStatus;
  /** The line shown on the card after Confirm (a template, never model text). */
  result?: string;
  startedAt?: string;
  /** For find_resources: the exact query that would be sent. */
  query?: string;
  meta?: ToolMeta;
};

export type Proposals = { tools: ToolProposal[] };

const legacyKind = {
  move: "move",
  connect: "reach_out",
  care: "care",
  do: "task",
  enjoy: "enjoy",
} as const satisfies Record<string, PlanKind>;

const stored = z.object({
  tools: z
    .array(
      z.object({
        id: z.string(),
        name: z.enum(toolNames),
        args: z.record(z.string(), z.unknown()),
        status: z.enum(["pending", "done", "dismissed"]),
        result: z.string().optional(),
        startedAt: z.string().optional(),
        query: z.string().optional(),
        meta: z
          .object({
            title: z.string().optional(),
            from: z.number().optional(),
            channel: z.string().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
  // The shape before tools: one step and/or one memory card, still pending.
  step: z
    .object({
      title: z.string(),
      area: z.enum(["move", "connect", "care", "do", "enjoy"]),
      cue: z.string().optional(),
    })
    .optional(),
  memory: z
    .object({
      kind: z.enum(["helps", "hard", "people", "preference"]),
      text: z.string(),
    })
    .optional(),
});

/** Reads a stored proposals value, old or new; null when nothing is on offer. */
export function readProposals(raw: unknown): Proposals | null {
  const parsed = stored.safeParse(raw);
  if (!parsed.success) return null;
  const { tools, step, memory } = parsed.data;
  const out: ToolProposal[] = tools.map((t) => ({ ...t }));
  if (step)
    out.push({
      id: "legacy-step",
      name: "add_item",
      args: { kind: legacyKind[step.area], title: step.title, size: "small" },
      status: "pending",
    });
  if (memory)
    out.push({
      id: "legacy-memory",
      name: "save_memory",
      args: { kind: memory.kind, text: memory.text },
      status: "pending",
    });
  return out.length ? { tools: out } : null;
}

// --- Checking a call --------------------------------------------------------------

export type VetItem = DayItem & { stepId: string; done: boolean };
export type VetPerson = { id: string; name: string; channel: string };

export type VetContext = {
  items: VetItem[];
  people: VetPerson[];
  model: IntakeModel;
  memoryOn: boolean;
  /** Text of the memory cards already kept. */
  memories: string[];
  planMode: "normal" | "lighter";
};

/** Words that make a memory card a health record, not a preference. */
const sensitiveMemory =
  /\b(diagnos\w*|depress\w*|anxi\w*|medicat\w*|medicine|pills?|tablets?|dose|doses|mg|antidepress\w*|suicid\w*|self[- ]?harm\w*|trauma\w*|abus\w*|therap\w*|psychiatr\w*|disorder|panic|overdos\w*)\b/i;

/** Rules every string a tool carries must pass, whatever the tool. */
export const textOk = (s: string) =>
  detectRisk(s) === "none" && !mentionsContact(s);

/**
 * The fields where a model writes free words. Ids and enum values are not
 * words (an id can hold a long run of digits that looks like a phone number).
 */
const wordFields: Partial<Record<ToolName, string[]>> = {
  add_item: ["title", "why"],
  shrink_item: ["smallerTitle"],
  save_memory: ["text"],
  draft_message: ["draft"],
};
const wordsOf = (name: ToolName, args: Record<string, unknown>) =>
  (wordFields[name] ?? []).flatMap((k) =>
    typeof args[k] === "string" ? [args[k] as string] : [],
  );

const sameTitle = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Composition rules that don't apply to one item the person asked for: the
 * count is capped at five separately, and the day's balance and times are the
 * planner's job. The limits on reach outs and moves and the eating rule stay.
 */
const notForOneItem = ["count", "no_lift", "no_core", "size", "time"];

function compositionCtx(v: VetContext) {
  return { ...contextFor(v.model, false), lighter: v.planMode === "lighter" };
}

/**
 * Turns one validated call into a pending proposal, or null when it fails a
 * check. The caller counts the nulls and says nothing to the person.
 */
export function vetCall(
  name: ToolName,
  rawArgs: unknown,
  v: VetContext,
): Omit<ToolProposal, "id" | "status"> | null {
  const schema = toolSchemas[name];
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) return null;
  const a = parsed.data as Record<string, unknown>;
  if (!wordsOf(name, a).every(textOk)) return null;
  const eating = v.model.eatingConcern;
  const item = (id: unknown) => v.items.find((i) => i.stepId === id);

  switch (name) {
    case "add_item": {
      const x = a as z.infer<(typeof toolSchemas)["add_item"]>;
      const why = x.why || "You asked for this in Talk";
      if (!itemTextOk({ title: x.title, why }, eating)) return null;
      if (v.items.length >= 5) return null;
      if (v.items.some((i) => sameTitle(i.title, x.title))) return null;
      const at = x.minuteOfDay ?? undefined;
      if (at !== undefined && (at < EARLIEST_MINUTE || at > LAST_MINUTE))
        return null;
      const added = {
        kind: x.kind,
        title: x.title,
        size: x.size,
        minuteOfDay: at ?? 12 * 60,
      };
      if (
        introduces(
          v.items,
          [...v.items, added],
          compositionCtx(v),
          notForOneItem,
        )
      )
        return null;
      return {
        name,
        args: {
          kind: x.kind,
          title: x.title,
          size: x.size,
          why,
          minuteOfDay: at,
        },
      };
    }
    case "move_item": {
      const x = a as z.infer<(typeof toolSchemas)["move_item"]>;
      const it = item(x.itemId);
      if (!it || it.done) return null;
      if (x.minuteOfDay < EARLIEST_MINUTE || x.minuteOfDay > LAST_MINUTE)
        return null;
      if (x.minuteOfDay === it.minuteOfDay) return null;
      return {
        name,
        args: { itemId: x.itemId, minuteOfDay: x.minuteOfDay },
        meta: { title: it.title, from: it.minuteOfDay },
      };
    }
    case "shrink_item": {
      const x = a as z.infer<(typeof toolSchemas)["shrink_item"]>;
      const it = item(x.itemId);
      if (!it || it.done) return null;
      // Already as small as it gets: nothing to offer.
      const base = smallerVersion(it, v.model);
      if (!base) return null;
      const smaller = x.smallerTitle || undefined;
      if (
        smaller &&
        (!itemTextOk({ title: smaller, why: base.why }, eating) ||
          sameTitle(smaller, it.title))
      )
        return null;
      return {
        name,
        args: {
          itemId: x.itemId,
          ...(smaller ? { smallerTitle: smaller } : {}),
        },
        meta: { title: it.title },
      };
    }
    case "set_reminder": {
      const x = a as z.infer<(typeof toolSchemas)["set_reminder"]>;
      if (x.morningPlan) return { name, args: { morningPlan: x.morningPlan } };
      const it = item(x.itemId);
      if (!it || it.done) return null;
      return {
        name,
        args: { itemId: x.itemId },
        meta: { title: it.title, from: it.minuteOfDay },
      };
    }
    case "save_memory": {
      const x = a as z.infer<(typeof toolSchemas)["save_memory"]>;
      if (!v.memoryOn) return null;
      if (sensitiveMemory.test(x.text)) return null;
      if (eating && (mentionsFood(x.text) || mentionsExercise(x.text)))
        return null;
      if (v.memories.some((m) => sameTitle(m, x.text))) return null;
      return { name, args: { kind: x.kind, text: x.text } };
    }
    case "find_resources": {
      const x = a as z.infer<(typeof toolSchemas)["find_resources"]>;
      const query = buildResourceQuery({
        goal: x.goal,
        interest: x.interest,
        format: x.format,
      });
      if (eating && (mentionsFood(query) || mentionsExercise(query)))
        return null;
      return {
        name,
        args: {
          goal: x.goal,
          ...(x.interest ? { interest: x.interest } : {}),
          ...(x.format ? { format: x.format } : {}),
        },
        query,
      };
    }
    case "draft_message": {
      const x = a as z.infer<(typeof toolSchemas)["draft_message"]>;
      const who = v.people.find((p) => p.id === x.personId);
      if (!who) return null;
      return {
        name,
        args: { personId: x.personId, draft: x.draft },
        meta: { title: who.name, channel: who.channel },
      };
    }
    case "prepare_appointment":
      return { name, args: {} };
  }
}

/**
 * Validated calls in, at most two pending proposals out. A call that fails a
 * check, repeats an earlier one or comes after the second card is dropped.
 */
export function vetCalls(
  calls: { id?: string; name: string; args: unknown }[],
  v: VetContext,
  newId: () => string = () => crypto.randomUUID(),
) {
  const proposals: ToolProposal[] = [];
  let dropped = 0;
  for (const c of calls) {
    const name = toolNames.find((n) => n === c.name);
    const vetted = name ? vetCall(name, c.args, v) : null;
    const key = vetted && vetted.name + JSON.stringify(vetted.args);
    if (
      !vetted ||
      proposals.length >= MAX_CARDS ||
      proposals.some((p) => p.name + JSON.stringify(p.args) === key)
    ) {
      dropped++;
      continue;
    }
    proposals.push({ ...vetted, id: newId(), status: "pending" });
  }
  return { proposals, dropped };
}

// --- Lines on the cards ----------------------------------------------------------------

/** Said when the model gave no words of its own. */
export const LEAD_IN = "Here's something you could do.";

export const undoOnToday = "You can undo it on Today.";

/** Lines shown on a card once it is done. Times arrive already written the way the person reads them. */
export const resultLines = {
  add_item: () => `Added to today. ${undoOnToday}`,
  move_item: (time: string) => `Moved to ${time}. ${undoOnToday}`,
  shrink_item: () => `Made it smaller. ${undoOnToday}`,
  reminderItem: (time: string) => `Reminder set for ${time}.`,
  reminderMorning: (time: string) => `Morning plan reminder on at ${time}.`,
  save_memory: () => "Saved to what Koe knows.",
  find_resources: (count = 0) =>
    count
      ? `Added ${count} ${count === 1 ? "pick" : "picks"} to your Shelf.`
      : "No new picks this time. You can check your Shelf later.",
  draftCopied: () => "Copied. Nothing was sent.",
  draftSms: () => "Opened in Messages. Nothing was sent.",
  draftEmail: () => "Opened in email. Nothing was sent.",
  prepare_appointment: () => "Opened your appointment notes.",
  dismissed: () => "Okay, nothing changed.",
} as const;

/** "17:00" to minutes, for the morning plan reminder. */
export const clockToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
