"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RiskLevel } from "@/domain/safety";
import { patterns } from "@/domain/journey";
import { weekStart } from "@/domain/time";
import { addMemory } from "../data/memory";
import {
  addNote,
  deleteNote,
  saveWeeklyReview,
  updateNote,
} from "../data/notes";
import { updateProfile } from "../data/profile";
import { listSteps, setStepStatus } from "../data/steps";
import { screen } from "../safety";
import { requireViewer } from "../viewer";

const refresh = () => revalidatePath("/", "layout");

const noteText = z
  .string()
  .trim()
  .min(1, "Write a few words first.")
  .max(3000, "Use 3,000 characters or fewer.");

export async function writeNote(input: {
  text: string;
  energy?: string | null;
}): Promise<{ ok: boolean; error?: string; safety?: RiskLevel }> {
  const v = await requireViewer();
  const text = noteText.safeParse(input.text);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const energy = z
    .enum(["low", "okay", "more"])
    .nullable()
    .catch(null)
    .parse(input.energy ?? null);
  await addNote(v.db, v.user.id, { text: text.data, energy });
  const safety = await screen(v.db, v.user.id, "note", [text.data]);
  refresh();
  return { ok: true, safety };
}

export async function editNote(
  id: string,
  text: string,
): Promise<{ ok: boolean; error?: string; safety?: RiskLevel }> {
  const v = await requireViewer();
  const parsed = noteText.safeParse(text);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  await updateNote(v.db, v.user.id, z.string().max(64).parse(id), parsed.data);
  const safety = await screen(v.db, v.user.id, "note", [parsed.data]);
  refresh();
  return { ok: true, safety };
}

export async function removeNote(id: string) {
  const v = await requireViewer();
  await deleteNote(v.db, v.user.id, z.string().max(64).parse(id));
  refresh();
}

/** The person says a counted pattern fits: keep it as a memory card. */
export async function keepPattern(key: string) {
  const v = await requireViewer();
  const steps = await listSteps(v.db, v.user.id);
  const found = patterns(steps, []).find((p) => p.key === key);
  if (!found) return;
  if (v.profile.memoryOn)
    await addMemory(v.db, v.user.id, {
      kind: "helps",
      text: found.memory,
      source: "report",
      sourceRef: key,
    });
  await updateProfile(v.db, v.user.id, {
    dismissedPatterns: [...v.profile.dismissedPatterns, key].slice(-100),
  });
  refresh();
}

export async function dismissPattern(key: string) {
  const v = await requireViewer();
  await updateProfile(v.db, v.user.id, {
    dismissedPatterns: [
      ...v.profile.dismissedPatterns,
      z.string().max(80).parse(key),
    ].slice(-100),
  });
  refresh();
}

const decisions = z.record(
  z.string().max(64),
  z.enum(["keep", "shrink", "swap", "pause"]),
);

/** Saves the weekly look-back. "Swap" lets the step go; "pause" pauses it. */
export async function saveWeek(input: {
  note: string;
  decisions: Record<string, string>;
}): Promise<{ ok: boolean; error?: string; safety?: RiskLevel }> {
  const v = await requireViewer();
  const note = z.string().trim().max(1000, "Use 1,000 characters or fewer.");
  const parsedNote = note.safeParse(input.note);
  if (!parsedNote.success)
    return { ok: false, error: parsedNote.error.issues[0].message };
  const chosen = decisions.parse(input.decisions);
  const steps = await listSteps(v.db, v.user.id);
  const own = new Set(steps.map((s) => s.id));
  const kept = Object.fromEntries(
    Object.entries(chosen).filter(([id]) => own.has(id)),
  );
  for (const [id, d] of Object.entries(kept)) {
    if (d === "pause") await setStepStatus(v.db, v.user.id, id, "paused");
    if (d === "swap") await setStepStatus(v.db, v.user.id, id, "archived");
  }
  await saveWeeklyReview(v.db, v.user.id, weekStart(v.today), {
    note: parsedNote.data || null,
    decisions: kept,
  });
  const safety = await screen(v.db, v.user.id, "week", [parsedNote.data]);
  refresh();
  return { ok: true, safety };
}
