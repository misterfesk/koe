"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EVERY_DAY, inQuietHours } from "@/domain/reminders";
import { isValidTimeZone, localMinutes } from "@/domain/time";
import { helpResources } from "@/fixtures/help-resources";
import { auth } from "../auth";
import { memoryKinds, tones, user } from "../db/schema";
import { addMemory, deleteMemory, updateMemory } from "../data/memory";
import { saveSummary } from "../data/intake";
import { updateProfile } from "../data/profile";
import {
  deleteMorningReminder,
  deleteReminder,
  deleteSubscription,
  pauseReminder,
  rescheduleAll,
  saveSubscription,
  setMorningReminder,
  setReminder,
  subscriptionsFor,
} from "../data/reminders";
import { pushConfigured, sendDetailed } from "../push";
import { allow } from "../rate-limit";
import { getStep } from "../data/steps";
import { screen } from "../safety";
import { getViewer, requireViewer } from "../viewer";
import type { RiskLevel } from "@/domain/safety";

const refresh = () => revalidatePath("/", "layout");
const id = z.string().max(64);

const region = z
  .string()
  .max(8)
  .transform((r) => (helpResources.some((h) => h.region === r) ? r : "OTHER"));

/** Help works signed out too; only a signed-in person's choice is saved. */
export async function setRegion(value: string) {
  const v = await getViewer();
  if (!v?.profile) return;
  await updateProfile(v.db, v.user.id, { region: region.parse(value) });
  refresh();
}

const appearance = z.object({
  tone: z.enum(tones).optional(),
  plain: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  mascot: z.boolean().optional(),
});

export async function setAppearance(input: z.input<typeof appearance>) {
  const v = await requireViewer();
  await updateProfile(v.db, v.user.id, appearance.parse(input));
  refresh();
}

const place = z.object({
  region,
  timezone: z.string().max(64).refine(isValidTimeZone, "Pick a timezone."),
});

export async function setPlace(input: z.input<typeof place>) {
  const v = await requireViewer();
  const next = place.parse(input);
  await updateProfile(v.db, v.user.id, next);
  if (next.timezone !== v.profile.timezone)
    await rescheduleAll(v.db, v.user.id, next.timezone);
  refresh();
}

const privacy = z.object({
  memoryOn: z.boolean().optional(),
  keepTranscripts: z.boolean().optional(),
});

export async function setPrivacy(input: z.input<typeof privacy>) {
  const v = await requireViewer();
  await updateProfile(v.db, v.user.id, privacy.parse(input));
  refresh();
}

// --- About me (memory cards) ---

const card = z.object({
  kind: z.enum(memoryKinds),
  text: z
    .string()
    .trim()
    .min(3, "Write a few words.")
    .max(200, "Use 200 characters or fewer."),
});

export async function saveMemory(
  input: z.input<typeof card> & { id?: string },
): Promise<{ ok: boolean; error?: string; safety?: RiskLevel }> {
  const v = await requireViewer();
  const parsed = card.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (input.id)
    await updateMemory(v.db, v.user.id, id.parse(input.id), parsed.data);
  else await addMemory(v.db, v.user.id, { ...parsed.data, source: "you" });
  const safety = await screen(v.db, v.user.id, "memory", [parsed.data.text]);
  refresh();
  return { ok: true, safety };
}

const summaryInput = z
  .string()
  .trim()
  .min(1, "Write a few words, or leave it as it is.")
  .max(400, "Use 400 characters or fewer.");

/** The summary from the intro, edited in What Koe knows. */
export async function editSummary(
  input: string,
): Promise<{ ok: boolean; error?: string; safety?: RiskLevel }> {
  const v = await requireViewer();
  const parsed = summaryInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const saved = await saveSummary(v.db, v.user.id, parsed.data);
  if (!saved) return { ok: false, error: "There is no summary to change yet." };
  const safety = await screen(v.db, v.user.id, "memory", [parsed.data]);
  refresh();
  return { ok: true, safety };
}

export async function toggleMemoryUse(cardId: string, use: boolean) {
  const v = await requireViewer();
  await updateMemory(v.db, v.user.id, id.parse(cardId), {
    useForSuggestions: z.boolean().parse(use),
  });
  refresh();
}

export async function removeMemory(cardId: string) {
  const v = await requireViewer();
  await deleteMemory(v.db, v.user.id, id.parse(cardId));
  refresh();
}

// --- Reminders ---

const reminderInput = z.object({
  stepId: id,
  minuteOfDay: z.number().int().min(0).max(1439),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day.")
    .max(7),
});

export async function saveReminder(
  input: z.input<typeof reminderInput>,
): Promise<{ ok: boolean; error?: string }> {
  const v = await requireViewer();
  const parsed = reminderInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (
    inQuietHours(
      parsed.data.minuteOfDay,
      v.profile.quietStart,
      v.profile.quietEnd,
    )
  )
    return {
      ok: false,
      error:
        "That's inside your quiet hours. Pick another time, or change quiet hours below.",
    };
  const ok = await setReminder(
    v.db,
    v.user.id,
    parsed.data,
    v.profile.timezone,
  );
  refresh();
  return ok ? { ok } : { ok, error: "That one is gone." };
}

export async function toggleReminder(reminderId: string, paused: boolean) {
  const v = await requireViewer();
  await pauseReminder(
    v.db,
    v.user.id,
    id.parse(reminderId),
    z.boolean().parse(paused),
    v.profile.timezone,
  );
  refresh();
}

export async function removeReminder(reminderId: string) {
  const v = await requireViewer();
  await deleteReminder(v.db, v.user.id, id.parse(reminderId));
  refresh();
}

const quiet = z.object({
  quietStart: z.number().int().min(0).max(1439),
  quietEnd: z.number().int().min(0).max(1439),
});

export async function setQuietHours(input: z.input<typeof quiet>) {
  const v = await requireViewer();
  await updateProfile(v.db, v.user.id, quiet.parse(input));
  refresh();
}

// Only the browsers' own push services: the server makes requests to this
// address, so an arbitrary URL would let anyone aim it at other hosts.
const pushHosts = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

const subscription = z.object({
  endpoint: z
    .url()
    .max(2000)
    .refine((u) => {
      const url = new URL(u);
      return (
        url.protocol === "https:" &&
        !url.port &&
        pushHosts.some((h) => h.test(url.hostname))
      );
    }, "Unsupported push service"),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(4).max(100),
  }),
});

export async function subscribePush(input: unknown) {
  const v = await requireViewer();
  if (!pushConfigured()) return { ok: false };
  const s = subscription.parse(input);
  await saveSubscription(v.db, v.user.id, {
    endpoint: s.endpoint,
    p256dh: s.keys.p256dh,
    auth: s.keys.auth,
  });
  refresh();
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  const v = await requireViewer();
  const subs = await subscriptionsFor(v.db, [v.user.id]);
  if (subs.some((s) => s.endpoint === endpoint))
    await deleteSubscription(v.db, endpoint);
  refresh();
}

export type TestResult = { ok: boolean; message: string };

/**
 * Sends a test notification to this person's own devices and says plainly
 * what happened. "Delivered" is never claimed: the push service accepted it.
 */
export async function sendTestReminder(): Promise<TestResult> {
  const v = await requireViewer();
  if (!pushConfigured())
    return {
      ok: false,
      message: "Reminders aren't set up on this server yet.",
    };
  if (!(await allow("reminder-test", v.user.id)))
    return {
      ok: false,
      message: "That's a few tests in a minute. Try again shortly.",
    };
  const subs = await subscriptionsFor(v.db, [v.user.id]);
  if (!subs.length)
    return {
      ok: false,
      message:
        "This device isn't set up for reminders yet. Turn them on first.",
    };
  const r = await sendDetailed(
    v.db,
    subs,
    JSON.stringify({
      title: "Koe",
      body: "This is a test. Reminders will look like this.",
      url: "/you/reminders",
    }),
  );
  if (r.delivered)
    return { ok: true, message: "Test on its way. Check your notifications." };
  if (r.expired && !r.refused)
    return {
      ok: false,
      message:
        "This device's reminder setup had expired. Turn reminders on again.",
    };
  return {
    ok: false,
    message:
      "The browser's notification service didn't accept it" +
      (r.status ? ` (code ${r.status}).` : ".") +
      " Try turning reminders on again.",
  };
}

const remindInput = z.object({
  stepId: id,
  minuteOfDay: z.number().int().min(0).max(1439).optional(),
});

/** "Remind me" on an entry: at its own time, or at a time the person picks. */
export async function remindMe(
  input: z.input<typeof remindInput>,
): Promise<{ ok: boolean; error?: string; minuteOfDay?: number }> {
  const v = await requireViewer();
  const parsed = remindInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a time first." };
  const s = await getStep(v.db, v.user.id, parsed.data.stepId);
  if (!s) return { ok: false, error: "That one is gone." };
  const minuteOfDay = parsed.data.minuteOfDay ?? s.minuteOfDay;
  if (minuteOfDay === null || minuteOfDay === undefined)
    return { ok: false, error: "Pick a time first." };
  if (inQuietHours(minuteOfDay, v.profile.quietStart, v.profile.quietEnd))
    return {
      ok: false,
      error:
        "That's inside your quiet hours. Pick another time, or change quiet hours in You.",
    };
  if (
    !s.repeatDays &&
    s.plannedFor === v.today &&
    minuteOfDay <= localMinutes(v.profile.timezone)
  )
    return {
      ok: false,
      error: "That time has passed today. Move it to later first.",
    };
  const ok = await setReminder(
    v.db,
    v.user.id,
    { stepId: s.id, minuteOfDay, days: s.repeatDays ?? EVERY_DAY },
    v.profile.timezone,
  );
  refresh();
  return ok ? { ok, minuteOfDay } : { ok, error: "That one is gone." };
}

const morningInput = z.object({
  minuteOfDay: z.number().int().min(0).max(1439),
});

/** Turns the morning plan reminder off. */
export async function turnOffMorningPlan() {
  const v = await requireViewer();
  await deleteMorningReminder(v.db, v.user.id);
  refresh();
}

/** The morning plan reminder: on at this time, or changed to it. */
export async function turnOnMorningPlan(
  input: z.input<typeof morningInput>,
): Promise<{ ok: boolean; error?: string }> {
  const v = await requireViewer();
  const parsed = morningInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a time first." };
  if (
    inQuietHours(
      parsed.data.minuteOfDay,
      v.profile.quietStart,
      v.profile.quietEnd,
    )
  )
    return {
      ok: false,
      error:
        "That's inside your quiet hours. Pick another time, or change quiet hours below.",
    };
  await setMorningReminder(
    v.db,
    v.user.id,
    parsed.data.minuteOfDay,
    v.profile.timezone,
  );
  refresh();
  return { ok: true };
}

// --- Account ---

/** Deletes the person and everything they made (rows cascade). */
export async function deleteAccount(confirmation: string) {
  const v = await requireViewer();
  if (confirmation.trim().toLowerCase() !== "delete") return { ok: false };
  // Delete first: if that fails, the person is still signed in and can retry.
  await v.db.delete(user).where(eq(user.id, v.user.id));
  try {
    await (await auth()).api.signOut({ headers: await headers() });
  } catch {
    // The session row went with the user; the stale cookie points at nothing.
  }
  redirect("/?deleted=1");
}
