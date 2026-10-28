// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { capturedThingSchema } from "@/domain/week";
import { fallbackPieces } from "@/domain/piece-rules";
const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({ getViewer: async () => viewer.current }));
let db: Awaited<ReturnType<(typeof import("@/server/db"))["openDb"]>>;
beforeAll(async () => {
  process.env.NEBIUS_API_KEY = "test-key-never-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  db = await (await import("@/server/db")).openDb("memory:");
}, 30_000);
const captured = capturedThingSchema.parse({
  what: "Updating my CV",
  left: "the opening paragraph",
});
const draft = { items: [{ captured, pieces: fallbackPieces(captured) }] };
async function owners() {
  const schema = await import("@/server/db/schema");
  const a = crypto.randomUUID(),
    b = crypto.randomUUID();
  for (const id of [a, b]) {
    await db
      .insert(schema.user)
      .values({ id, name: id, email: `${id}@example.com` });
    await db
      .insert(schema.profile)
      .values({ userId: id, onboardedAt: new Date() });
  }
  return { a, b, schema };
}
describe("approved week storage", () => {
  it("encrypts all personal text and exports decrypted owner-only content", async () => {
    const { a, b, schema } = await owners();
    const data = await import("@/server/data/week");
    const saved = await data.saveWeek(db, a, {
      draft,
      today: "2026-10-28",
      eatingConcern: false,
    });
    expect(await data.getWeek(db, b, saved.id)).toBeNull();
    const [rawItem] = await db
      .select()
      .from(schema.weekItem)
      .where(eq(schema.weekItem.weekId, saved.id));
    const [rawPiece] = await db
      .select()
      .from(schema.piece)
      .where(eq(schema.piece.weekItemId, rawItem.id));
    expect(rawItem.capturedEnc).toMatch(/^v1\./);
    expect(rawPiece.dataEnc).not.toContain("paragraph");
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, a));
    viewer.current = {
      user: { id: a },
      db,
      profile,
      today: "2026-10-28",
      isGuest: true,
    };
    const exported = await (await import("@/app/api/export/route")).GET();
    expect((await exported.json()).weeks).toMatchObject([
      { items: [{ captured: { what: "Updating my CV" } }] },
    ]);
  });
  it("appends with version checking, preserves IDs/status and retries idempotently", async () => {
    const { a, b, schema } = await owners();
    const data = await import("@/server/data/week");
    const input = {
      draft,
      today: "2026-10-28",
      eatingConcern: false,
      createId: crypto.randomUUID(),
    };
    const saved = await data.saveWeek(db, a, input);
    expect((await data.saveWeek(db, a, input)).id).toBe(saved.id);
    await db
      .update(schema.piece)
      .set({ status: "done" })
      .where(eq(schema.piece.id, saved.items[0].pieces[0].id));
    const append = {
      ...input,
      weekId: saved.id,
      expectedVersion: 1,
      createId: crypto.randomUUID(),
    };
    const updated = await data.saveWeek(db, a, append);
    expect(updated.items).toHaveLength(2);
    expect(updated.items[0].pieces[0]).toMatchObject({
      id: saved.items[0].pieces[0].id,
      status: "done",
    });
    expect((await data.saveWeek(db, a, append)).items).toHaveLength(2);
    await expect(
      data.saveWeek(db, a, { ...append, createId: crypto.randomUUID() }),
    ).rejects.toThrow(/changed/);
    await expect(
      data.saveWeek(db, b, { ...append, createId: crypto.randomUUID() }),
    ).rejects.toThrow(/changed/);
  });
  it("keeps both colliding weeks on guest transfer, then cascades deletion", async () => {
    const { a, b, schema } = await owners();
    const data = await import("@/server/data/week");
    for (const owner of [a, b])
      await data.saveWeek(db, owner, {
        draft,
        today: "2026-10-28",
        eatingConcern: false,
      });
    await (await import("@/server/db/ownership")).transferOwnership(db, a, b);
    expect(await data.listWeeks(db, a)).toEqual([]);
    expect(await data.listWeeks(db, b)).toHaveLength(2);
    await db.delete(schema.user).where(eq(schema.user.id, b));
    expect(await data.listWeeks(db, b)).toEqual([]);
    expect(
      await db.select().from(schema.piece).where(eq(schema.piece.userId, b)),
    ).toHaveLength(0);
  });
  it("rolls back intro and week together if approval fails", async () => {
    const { a, schema } = await owners();
    const { commitIntroInTransaction } = await import("@/server/data/intake");
    const { saveWeekInTransaction } = await import("@/server/data/week");
    const { emptyModel } = await import("@/domain/intake");
    const { fallbackPlan } = await import("@/domain/plan-menu");
    const model = emptyModel();
    await expect(
      db.transaction(async (tx) => {
        await commitIntroInTransaction(tx, a, {
          model,
          summary: "You want a simpler day.",
          memories: [],
          people: [],
          items: fallbackPlan(model),
          memoryOn: true,
          today: "2026-10-28",
        });
        await saveWeekInTransaction(tx, a, {
          draft: {
            items: [
              {
                ...draft.items[0],
                pieces: [{ ...draft.items[0].pieces[0], minutes: 26 }],
              },
            ],
          },
          today: "2026-10-28",
          eatingConcern: false,
        });
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(schema.userModel)
        .where(eq(schema.userModel.userId, a)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.planDay)
        .where(eq(schema.planDay.userId, a)),
    ).toHaveLength(0);
  });
});
