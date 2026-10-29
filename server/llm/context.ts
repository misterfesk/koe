import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { namableLifts, type IntakeModel } from "@/domain/intake";
import type { PlanItem } from "@/domain/plan-menu";
import { addDays, localDay } from "@/domain/time";
import { db as openDefaultDb, type Db } from "../db";
import { profile, step, stepReport } from "../db/schema";
import { listMemory } from "../data/memory";
import { listNotes } from "../data/notes";
import { getPlanDay, getUserModel } from "../data/intake";

// The context packet: a small, structured picture of one person for the
// planner and Talk, instead of chat history. Keys are written in a fixed
// order and lists are sorted, so the text is identical until something
// changes and the provider can cache the prefix.

type OutcomeCounts = {
  done: number;
  partly: number;
  not: number;
  skip: number;
};

export type ContextPacket = {
  v: 1;
  tone: string;
  memory: "on" | "off";
  intake?: Record<string, unknown>;
  summary?: string;
  memories?: { kind: string; text: string }[];
  notes?: { kind: string; text: string }[];
  outcomes7d: Record<string, OutcomeCounts>;
  today: {
    day: string;
    mode: string;
    items: (Partial<PlanItem> & { id?: string })[];
  } | null;
};

/** The model's answers, without empty fields, in a fixed order. */
export function compactModel(model: IntakeModel) {
  const out: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    if (Array.isArray(value) ? value.length : value) out[key] = value;
  };
  put("goals", model.goals);
  put("wake", model.wake);
  put("days", model.days);
  put("busiest", model.busiest);
  put("puttingOff", model.puttingOff);
  put("lifts", namableLifts(model));
  put("people", model.people);
  put(
    "names",
    model.names.map((n) => n.name),
  );
  put("support", model.support);
  put("tone", model.tone);
  put("morningPlan", model.morningPlan);
  put("notes", Object.values(model.notes).some(Boolean) ? model.notes : null);
  put("eatingConcern", model.eatingConcern);
  return out;
}

/** Counts per kind for the last seven days (today and the six before it). */
async function outcomes(db: Db, userId: string, today: string) {
  const rows = await db
    .select({
      kind: step.kind,
      area: step.area,
      outcome: stepReport.outcome,
    })
    .from(stepReport)
    .innerJoin(step, eq(step.id, stepReport.stepId))
    .where(
      and(
        eq(stepReport.userId, userId),
        gte(stepReport.day, addDays(today, -6)),
      ),
    );
  const counts = new Map<string, OutcomeCounts>();
  for (const r of rows) {
    const key = r.kind ?? `area:${r.area}`;
    const c = counts.get(key) ?? { done: 0, partly: 0, not: 0, skip: 0 };
    c[r.outcome]++;
    counts.set(key, c);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export async function buildContext(
  db: Db,
  userId: string,
  today: string,
): Promise<ContextPacket> {
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId));
  const memoryOn = p?.memoryOn ?? true;
  const [counts, plan] = await Promise.all([
    outcomes(db, userId, today),
    getPlanDay(db, userId, today),
  ]);
  const todayPlan = plan && {
    day: plan.day,
    mode: plan.mode,
    // With memory off, the plan's shape is kept but not what the person wrote.
    items: plan.items.map((i) =>
      memoryOn
        ? {
            id: i.stepId,
            kind: i.kind,
            title: i.title,
            why: i.why,
            size: i.size,
            minuteOfDay: i.minuteOfDay,
          }
        : {
            id: i.stepId,
            kind: i.kind,
            size: i.size,
            minuteOfDay: i.minuteOfDay,
          },
    ),
  };
  if (!memoryOn)
    return {
      v: 1,
      tone: p?.tone ?? "expressive",
      memory: "off",
      outcomes7d: counts,
      today: todayPlan,
    };
  const [model, cards, rawNotes] = await Promise.all([
    getUserModel(db, userId),
    listMemory(db, userId),
    listNotes(db, userId),
  ]);
  const used = cards
    .filter((c) => c.useForSuggestions)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(-12);
  const recentNotes = rawNotes
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(-5)
    .map((n) => ({
      kind: n.kind,
      text: n.text.length > 200 ? n.text.slice(0, 197).trimEnd() + "…" : n.text,
    }));
  const packet: ContextPacket = {
    v: 1,
    tone: p?.tone ?? "expressive",
    memory: "on",
    outcomes7d: counts,
    today: todayPlan,
  };
  // Re-order so the stable parts come first.
  return {
    v: packet.v,
    tone: packet.tone,
    memory: packet.memory,
    ...(model ? { intake: compactModel(model.model) } : {}),
    ...(model?.summary ? { summary: model.summary } : {}),
    memories: used.map((c) => ({ kind: c.kind, text: c.text })),
    ...(recentNotes.length ? { notes: recentNotes } : {}),
    outcomes7d: packet.outcomes7d,
    today: packet.today,
  };
}

/** The packet for a person, using their own timezone for "today". */
export async function contextPacket(userId: string): Promise<ContextPacket> {
  const database = await openDefaultDb();
  const [p] = await database
    .select({ timezone: profile.timezone })
    .from(profile)
    .where(eq(profile.userId, userId));
  return buildContext(database, userId, localDay(p?.timezone ?? "UTC"));
}
