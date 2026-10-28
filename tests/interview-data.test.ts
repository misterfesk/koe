// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { capturedThingSchema } from "@/domain/week";
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
  what: "Updating my CV, the opening paragraph",
  when: "Friday",
  title: "Update my CV",
});
const draft = { items: [{ captured }] };
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
    expect(rawItem.capturedEnc).toMatch(/^v1\./);
    expect(rawItem.capturedEnc).not.toContain("paragraph");
    // No piece rows are written any more (D036).
    expect(await db.select().from(schema.piece)).toHaveLength(0);
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
      { items: [{ captured }] },
    ]);
  });
  it("appends with version checking, preserves IDs and retries idempotently", async () => {
    const { a, b } = await owners();
    const data = await import("@/server/data/week");
    const input = {
      draft,
      today: "2026-10-28",
      eatingConcern: false,
      createId: crypto.randomUUID(),
    };
    const saved = await data.saveWeek(db, a, input);
    expect((await data.saveWeek(db, a, input)).id).toBe(saved.id);
    const append = {
      ...input,
      weekId: saved.id,
      expectedVersion: 1,
      createId: crypto.randomUUID(),
    };
    const updated = await data.saveWeek(db, a, append);
    expect(updated.items).toHaveLength(2);
    expect(updated.items[0].id).toBe(saved.items[0].id);
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
      await db
        .select()
        .from(schema.weekItem)
        .where(eq(schema.weekItem.userId, b)),
    ).toHaveLength(0);
  });
  it("loads older rows that still carry retired fields", async () => {
    const { a, schema } = await owners();
    const data = await import("@/server/data/week");
    const { seal } = await import("@/server/crypto");
    const saved = await data.saveWeek(db, a, {
      draft,
      today: "2026-10-28",
      eatingConcern: false,
    });
    await db
      .update(schema.weekItem)
      .set({
        capturedEnc: seal(
          JSON.stringify({
            what: "sorting my records. Only one shelf.",
            originalWhat: "records",
            done: "",
            left: "half",
            stuck: "choosing",
            when: "",
          }),
        ),
      })
      .where(eq(schema.weekItem.weekId, saved.id));
    expect((await data.getWeek(db, a, saved.id))?.items[0].captured).toEqual({
      what: "sorting my records. Only one shelf.",
      when: "",
      title: "Sorting my records",
    });
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
              { captured: { ...captured, title: "We should take medication" } },
            ],
          },
          today: "2026-10-28",
          eatingConcern: false,
        });
      }),
    ).rejects.toThrow("Check the titles before saving.");
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
