import { z } from "zod";
import { planKinds } from "@/domain/plan-menu";

export const planDraft = z.object({
  kind: z.enum(planKinds),
  // Older forms allowed long draft titles; the save action enforces its limit.
  title: z.string().max(10000),
  time: z.string().regex(/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9])?$/),
});
export const problemDraft = z.object({
  stage: z.enum(["problem", "options", "choose", "plan"]),
  problem: z.string().max(1000),
  options: z.array(z.string().max(140)).min(2).max(8),
  chosen: z.string().max(140),
  planKey: z.string().max(64).default(""),
});

/** Called only after account deletion succeeded. Other owners and apps stay intact. */
export function clearOwnerDrafts(storage: Storage, owner: string) {
  let legacyOwned = true;
  try {
    const legacy = JSON.parse(storage.getItem("koe.intake.draft.v1") ?? "null");
    legacyOwned = !legacy?.owner || legacy.owner === owner;
  } catch {
    /* Unattributed legacy words are cleared on deletion. */
  }
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      (key === "koe.intake.draft.v1" && legacyOwned) ||
      key === `koe.plan-draft:add:${owner}` ||
      key === `koe.plan-draft:problem:${owner}` ||
      key === `koe.plan-draft:model:${owner}` ||
      key === `koe.plan-draft:intake:${owner}` ||
      key?.startsWith(`koe.plan-draft:interview:${owner}:`) ||
      key?.startsWith(`koe.plan-draft:problem-plan:${owner}:`) ||
      key?.startsWith(`koe.plan-draft:reach-out:${owner}:`) ||
      key?.startsWith(`koe.plan-draft:linked:${owner}:`)
    )
      keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Auth passes only a confirmed anonymous-to-account link. A collision keeps both drafts. */
export function transferOwnerDrafts(
  storage: Storage,
  from: string,
  to: string,
) {
  if (from === to) return;
  const keys = Array.from({ length: storage.length }, (_, i) =>
    storage.key(i),
  ).filter((key): key is string => !!key);
  for (const key of keys) {
    let destination: string | undefined;
    for (const kind of ["add", "problem", "model", "intake"])
      if (key === `koe.plan-draft:${kind}:${from}`)
        destination = `koe.plan-draft:${kind}:${to}`;
    for (const kind of ["problem-plan", "reach-out", "linked", "interview"]) {
      const prefix = `koe.plan-draft:${kind}:${from}:`;
      if (key.startsWith(prefix))
        destination =
          `koe.plan-draft:${kind}:${to}:` + key.slice(prefix.length);
    }
    if (!destination) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    if (
      storage.getItem(destination) !== null &&
      storage.getItem(destination) !== raw
    )
      destination = `koe.plan-draft:linked:${to}:` + crypto.randomUUID();
    let moved = raw;
    if (key === `koe.plan-draft:intake:${from}`) {
      try {
        moved = JSON.stringify({ ...JSON.parse(raw), owner: to });
      } catch {
        /* Validation happens on read. */
      }
    }
    storage.setItem(destination, moved);
    storage.removeItem(key);
  }
  // Only a confirmed guest link can move the intake envelope to its new owner.
  try {
    const raw = storage.getItem("koe.intake.draft.v1");
    const draft = raw ? JSON.parse(raw) : null;
    if (draft?.owner === from)
      storage.setItem(
        "koe.intake.draft.v1",
        JSON.stringify({ ...draft, owner: to }),
      );
  } catch {
    /* Invalid legacy drafts are never revived. */
  }
}
