"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireViewer } from "../viewer";
import { getShelf, setShelfFeedback, undoShelfFeedback } from "../data/shelf";
import { refreshShelfFor } from "../search/shelf";
import { requestedSearches, updateTool } from "../data/talk";
import { resourceTagsSchema } from "@/domain/resources";
import { resultLines } from "@/domain/talk-tools";

export async function readShelf() {
  return getShelf(await requireViewer());
}

export async function refreshShelf() {
  const v = await requireViewer();
  // Older confirmed S5 requests are consumed once through the same pipeline.
  for (const r of await requestedSearches(v.db, v.user.id)) {
    const tags = resourceTagsSchema.safeParse(r.tags);
    if (!tags.success) {
      await updateTool(v.db, v.user.id, r.messageId, r.proposalId, "done", {
        result: resultLines.find_resources(0),
        startedAt: undefined,
      });
      continue;
    }
    const done = await refreshShelfFor(v, tags.data, r.requestId);
    if (done.ok)
      await updateTool(v.db, v.user.id, r.messageId, r.proposalId, "done", {
        result: resultLines.find_resources(done.count),
        startedAt: undefined,
      });
  }
  const result = await refreshShelfFor(v);
  revalidatePath("/shelf");
  revalidatePath("/today");
  return { ...result, shelf: await getShelf(v) };
}

export async function shelfFeedback(raw: {
  id: string;
  status: "saved" | "not_for_me";
}) {
  const v = await requireViewer();
  const r = z
    .object({
      id: z.string().min(1).max(64),
      status: z.enum(["saved", "not_for_me"]),
    })
    .safeParse(raw);
  if (!r.success)
    return { ok: false as const, error: "Choose a pick from your Shelf." };
  const undoToken = await setShelfFeedback(
    v.db,
    v.user.id,
    r.data.id,
    r.data.status,
  );
  revalidatePath("/shelf");
  revalidatePath("/today");
  return undoToken
    ? { ok: true as const, undoToken }
    : {
        ok: false as const,
        error: "That pick is gone. Open your Shelf again.",
      };
}

export async function undoShelf(raw: string) {
  const v = await requireViewer();
  const token = z.string().max(4096).safeParse(raw);
  const ok =
    token.success && (await undoShelfFeedback(v.db, v.user.id, token.data));
  revalidatePath("/shelf");
  revalidatePath("/today");
  return {
    ok,
    error: ok ? undefined : "That choice has changed. Open your Shelf again.",
  };
}
