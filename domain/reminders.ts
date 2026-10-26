import { z } from "zod";
import type { State } from "./state";

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const reminderInput = z
  .object({
    enabled: z.boolean(),
    paused: z.boolean(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine(validTimezone, "Choose a valid IANA timezone."),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
    hour: z.number().int().min(0).max(23),
    frequency: z.enum(["daily", "weekly"]),
    weekday: z.number().int().min(0).max(6),
    targetId: z.string(),
  })
  .superRefine((value, context) => {
    if (value.enabled && !value.targetId) {
      context.addIssue({
        code: "custom",
        path: ["targetId"],
        message: "Choose a step before opting in.",
      });
    }
  });

export type ReminderPreview =
  | {
      kind: "ready";
      at: string;
      local: string;
      title: string;
      targetId: string;
      deferred: boolean;
    }
  | { kind: "idle"; reason: string }
  | { kind: "invalid"; errors: Record<string, string> };

const minute = 60_000;
const weekdays: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function inQuietHours(
  hour: number,
  start: number,
  end: number,
): boolean {
  if (start === end) return false;
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}

/** A deterministic fixture preview, not a scheduler or delivery queue. */
export function reminderPreview(
  state: Pick<
    State,
    "reminders" | "clock" | "steps" | "memories" | "memoryConsent" | "temporary"
  >,
): ReminderPreview {
  const parsed = reminderInput.safeParse(state.reminders);
  if (!parsed.success) {
    return {
      kind: "invalid",
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      ),
    };
  }
  const config = parsed.data;
  const now = Date.parse(state.clock);
  if (!Number.isFinite(now))
    return {
      kind: "invalid",
      errors: { clock: "Use a valid ISO virtual time." },
    };
  if (!config.enabled)
    return { kind: "idle", reason: "No reminder preview is opted in." };
  if (config.paused)
    return {
      kind: "idle",
      reason: "Reminder preview is paused. Nothing is pending.",
    };
  const target = state.steps.find((step) => step.id === config.targetId);
  if (!target)
    return {
      kind: "idle",
      reason: "The selected step no longer exists. Nothing is pending.",
    };
  if (target.paused)
    return {
      kind: "idle",
      reason: "The selected step is paused. Nothing is pending.",
    };
  if (
    "sourceMemoryId" in target &&
    typeof target.sourceMemoryId === "string" &&
    (!state.memoryConsent ||
      state.temporary ||
      !state.memories.some((memory) => memory.id === target.sourceMemoryId))
  ) {
    return {
      kind: "idle",
      reason:
        "The approved memory for this plan is unavailable. No preview is pending.",
    };
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (time: number) =>
    Object.fromEntries(
      formatter.formatToParts(time).map((part) => [part.type, part.value]),
    );
  const seenLocalDates = new Set<string>();
  const start = Math.floor((now - 36 * 60 * minute) / minute) * minute;
  const end = now + 9 * 24 * 60 * minute;
  for (let scheduled = start; scheduled <= end; scheduled += minute) {
    const local = parts(scheduled);
    if (Number(local.hour) !== config.hour || Number(local.minute) !== 0)
      continue;
    if (
      config.frequency === "weekly" &&
      weekdays[local.weekday] !== config.weekday
    )
      continue;
    const key = local.year + "-" + local.month + "-" + local.day;
    // A fall-back clock may show the same hour twice. The first occurrence owns the date.
    if (seenLocalDates.has(key)) continue;
    seenLocalDates.add(key);
    let at = scheduled;
    for (
      let count = 0;
      count < 26 * 60 &&
      inQuietHours(Number(parts(at).hour), config.quietStart, config.quietEnd);
      count += 1
    ) {
      at += minute;
    }
    if (at <= now) continue;
    const readable = new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone,
      dateStyle: "full",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(at);
    return {
      kind: "ready",
      at: new Date(at).toISOString(),
      local: readable,
      title: target.title,
      targetId: target.id,
      deferred: at !== scheduled,
    };
  }
  return {
    kind: "idle",
    reason:
      "No future preview in this virtual window. Choose another time if useful.",
  };
}
