"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { templateMessage, type Purpose } from "@/domain/connect";
import type { RiskLevel } from "@/domain/safety";
import {
  addPerson,
  deletePerson,
  listPeople,
  recordReachOut,
  setReachStatus,
} from "../data/people";
import { draftMessage } from "../llm/coach";
import { allow } from "../rate-limit";
import { screen } from "../safety";
import {
  lookupAppointmentHelp,
  type AppointmentResult,
} from "../search/intents";
import { requireViewer } from "../viewer";

const refresh = () => revalidatePath("/", "layout");
const id = z.string().max(64);

const personInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Add a name or nickname.")
    .max(60, "Use 60 characters or fewer."),
  channel: z.enum(["message", "call", "email", "in_person"]),
});

export async function savePerson(
  input: z.input<typeof personInput>,
): Promise<{ ok: boolean; error?: string }> {
  const v = await requireViewer();
  const parsed = personInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  await addPerson(v.db, v.user.id, parsed.data);
  refresh();
  return { ok: true };
}

export async function removePerson(personId: string) {
  const v = await requireViewer();
  await deletePerson(v.db, v.user.id, id.parse(personId));
  refresh();
}

const draftInput = z.object({
  personId: z.string().max(64).nullable(),
  name: z.string().trim().max(60).default(""),
  purpose: z.enum(["hello", "meet", "help", "hard"]),
  detail: z.string().trim().max(300).default(""),
});

export async function draftReachOut(
  input: z.input<typeof draftInput>,
): Promise<{ message: string; source: "ai" | "template"; safety: RiskLevel }> {
  const v = await requireViewer();
  const p = draftInput.parse(input);
  const people = await listPeople(v.db, v.user.id);
  const name = people.find((x) => x.id === p.personId)?.name ?? p.name;
  const fallback = templateMessage(p.purpose as Purpose, name);
  const safety = await screen(v.db, v.user.id, "reach", [p.detail]);
  if (safety !== "none" || v.profile.coachingPausedAt)
    return { message: fallback, source: "template", safety };
  const ai = await draftMessage(
    { name, purpose: p.purpose, detail: p.detail },
    v.user.id,
  );
  return ai
    ? { message: ai, source: "ai", safety }
    : { message: fallback, source: "template", safety };
}

/** The person says they sent it (Koe can't see or send anything). */
export async function markSent(input: {
  personId: string | null;
  draft: string;
}) {
  const v = await requireViewer();
  const draft = z.string().trim().min(1).max(1000).parse(input.draft);
  const people = await listPeople(v.db, v.user.id);
  const personId = people.some((x) => x.id === input.personId)
    ? input.personId
    : null;
  await recordReachOut(v.db, v.user.id, { personId, draft, status: "sent" });
  const safety = await screen(v.db, v.user.id, "reach", [draft]);
  refresh();
  return { safety };
}

export async function followUp(reachOutId: string, status: string) {
  const v = await requireViewer();
  await setReachStatus(
    v.db,
    v.user.id,
    id.parse(reachOutId),
    z.enum(["replied", "no_reply", "not_sent"]).parse(status),
  );
  refresh();
}

export async function lookupAppointments(rawInstructions = ""): Promise<{
  ok: boolean;
  results: AppointmentResult[];
  unavailable?: boolean;
  safety: RiskLevel;
}> {
  const v = await requireViewer();
  const instructions = z
    .string()
    .trim()
    .max(300)
    .parse(rawInstructions ?? "");
  if (instructions) {
    const safety = await screen(v.db, v.user.id, "care", [instructions]);
    if (safety !== "none") {
      refresh();
      return { ok: true, results: [], safety };
    }
  }
  if (v.profile.coachingPausedAt) {
    return { ok: false, results: [], unavailable: true, safety: "none" };
  }
  if (!(await allow("appointment-lookup", v.user.id)))
    return { ok: false, results: [], unavailable: true, safety: "none" };
  const res = await lookupAppointmentHelp({ v, instructions });
  return { ...res, safety: "none" };
}
