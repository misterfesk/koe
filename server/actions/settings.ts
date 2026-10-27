"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { inQuietHours } from "@/domain/reminders";
import { isValidTimeZone } from "@/domain/time";
import { helpResources } from "@/fixtures/help-resources";
import { auth } from "../auth";
import { memoryKinds, tones, user } from "../db/schema";
import { addMemory, deleteMemory, updateMemory } from "../data/memory";
import { updateProfile } from "../data/profile";
import {
  deleteReminder,
  deleteSubscription,
  pauseReminder,
  saveSubscription,
  setReminder,
  subscriptionsFor,
} from "../data/reminders";
import { pushConfigured, sendTo } from "../push";
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
  await updateProfile(v.db, v.user.id, place.parse(input));
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
  return ok ? { ok } : { ok, error: "This step is gone." };
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

const subscription = z.object({
  endpoint: z.url().max(2000),
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

export async function sendTestReminder() {
  const v = await requireViewer();
  const subs = await subscriptionsFor(v.db, [v.user.id]);
  const delivered = await sendTo(
    v.db,
    subs,
    JSON.stringify({
      title: "Koe",
      body: "This is a test. Reminders will look like this.",
      url: "/settings/reminders",
    }),
  );
  return { delivered };
}

// --- Account ---

/** Deletes the person and everything they made (rows cascade). */
export async function deleteAccount(confirmation: string) {
  const v = await requireViewer();
  if (confirmation.trim().toLowerCase() !== "delete") return { ok: false };
  try {
    await (await auth()).api.signOut({ headers: await headers() });
  } catch {
    // The rows go regardless; a stale cookie then points at nothing.
  }
  await v.db.delete(user).where(eq(user.id, v.user.id));
  redirect("/?deleted=1");
}
