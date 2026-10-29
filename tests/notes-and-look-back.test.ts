// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({
  requireViewer: async () => viewer.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-minimum-20-characters";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.KOE_AI = "off";
});

const TODAY = "2026-10-29";

async function setup() {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  await db
    .insert(schema.user)
    .values({ id: "user-1", name: "User 1", email: "user1@example.test" });
  await db.insert(schema.profile).values({
    userId: "user-1",
    timezone: "UTC",
    memoryOn: true,
    onboardedAt: new Date(),
  });
  return { db, schema };
}

// Embedded Postgres start-up is slow under parallel load.
describe("Notes and Look back parking", { timeout: 30_000 }, () => {
  it("listNotes returns notes newest first", async () => {
    const { db } = await setup();
    const { addNote, listNotes } = await import("@/server/data/notes");

    const id1 = await addNote(db, "user-1", {
      text: "First older note",
      energy: "low",
    });
    // Add small delay to ensure distinct timestamp
    await new Promise((r) => setTimeout(r, 10));
    const id2 = await addNote(db, "user-1", {
      text: "Second newer note",
      energy: "more",
    });

    const notes = await listNotes(db, "user-1");
    expect(notes.length).toBe(2);
    expect(notes[0].id).toBe(id2);
    expect(notes[0].text).toBe("Second newer note");
    expect(notes[0].energy).toBe("more");
    expect(notes[1].id).toBe(id1);
    expect(notes[1].text).toBe("First older note");
  });

  it("editNote updates note, safety screens, and updates Talk context", async () => {
    const { db, schema } = await setup();
    const { addNote } = await import("@/server/data/notes");
    const { editNote } = await import("@/server/actions/reflect");
    const { buildContext } = await import("@/server/llm/context");

    const noteId = await addNote(db, "user-1", {
      text: "Original note about piano",
    });

    const [p] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, "user-1"));
    viewer.current = {
      user: { id: "user-1" },
      profile: p,
      db,
      today: TODAY,
      isGuest: true,
    };

    // Before edit, context packet has original note
    const beforeCtx = await buildContext(db, "user-1", TODAY);
    expect(
      beforeCtx.notes?.some((n) => n.text === "Original note about piano"),
    ).toBe(true);

    // Edit the note
    const result = await editNote(noteId, "Updated note about guitar");
    expect(result.ok).toBe(true);
    expect(result.safety).toBe("none");

    // After edit, context packet immediately has updated text and no stale text
    const afterCtx = await buildContext(db, "user-1", TODAY);
    expect(
      afterCtx.notes?.some((n) => n.text === "Updated note about guitar"),
    ).toBe(true);
    expect(
      afterCtx.notes?.some((n) => n.text === "Original note about piano"),
    ).toBe(false);
  });

  it("editNote updates Shelf item why and linked memory cards", async () => {
    const { db, schema } = await setup();
    const { addNote } = await import("@/server/data/notes");
    const { editNote } = await import("@/server/actions/reflect");
    const { addMemory } = await import("@/server/data/memory");
    const { noteWhy } = await import("@/domain/resource-screen");
    const { open, seal } = await import("@/server/crypto");

    const noteText = "Morning walks in the park";
    const noteId = await addNote(db, "user-1", { text: noteText });

    // Insert a shelf item that was recommended because of this note
    await db.insert(schema.shelfItem).values({
      userId: "user-1",
      url: "https://example.com/park-walks",
      title: "Benefits of morning walks",
      host: "example.com",
      status: "current",
      week: "2026-W44",
      tagsKey: "exercise",
      whyEnc: seal(noteWhy(noteText)),
      foodOrExercise: false,
      aiScreened: false,
    });

    // Insert a memory card linked to this note
    const memId = await addMemory(db, "user-1", {
      kind: "helps",
      text: noteText,
      source: "you",
      sourceRef: noteId,
    });

    const [p] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, "user-1"));
    viewer.current = {
      user: { id: "user-1" },
      profile: p,
      db,
      today: TODAY,
      isGuest: true,
    };

    const newText = "Morning runs by the lake";
    await editNote(noteId, newText);

    // Verify shelfItem why was updated
    const [shelf] = await db
      .select()
      .from(schema.shelfItem)
      .where(eq(schema.shelfItem.userId, "user-1"));
    expect(open(shelf.whyEnc)).toBe(noteWhy(newText));

    // Verify memoryCard text was updated
    const [mem] = await db
      .select()
      .from(schema.memoryCard)
      .where(eq(schema.memoryCard.id, memId));
    expect(open(mem.textEnc)).toBe(newText);
  });

  it("removeNote removes note, drops from Talk context, deletes current Shelf item, and cleans memory", async () => {
    const { db, schema } = await setup();
    const { addNote, listNotes } = await import("@/server/data/notes");
    const { removeNote } = await import("@/server/actions/reflect");
    const { buildContext } = await import("@/server/llm/context");
    const { addMemory } = await import("@/server/data/memory");
    const { noteWhy } = await import("@/domain/resource-screen");
    const { open, seal } = await import("@/server/crypto");

    const noteText = "Cycling around the neighborhood";
    const noteId = await addNote(db, "user-1", { text: noteText });

    // Current shelf item based on this note
    await db.insert(schema.shelfItem).values({
      userId: "user-1",
      url: "https://example.com/cycling-route",
      title: "Best cycling routes",
      host: "example.com",
      status: "current",
      week: "2026-W44",
      tagsKey: "exercise",
      whyEnc: seal(noteWhy(noteText)),
      foodOrExercise: false,
      aiScreened: false,
    });

    // Saved shelf item based on this note (user kept the article)
    await db.insert(schema.shelfItem).values({
      userId: "user-1",
      url: "https://example.com/cycling-safety",
      title: "Cycling safety guide",
      host: "example.com",
      status: "saved",
      week: "2026-W44",
      tagsKey: "exercise",
      whyEnc: seal(noteWhy(noteText)),
      foodOrExercise: false,
      aiScreened: false,
    });

    // Memory card linked to note
    const memId = await addMemory(db, "user-1", {
      kind: "helps",
      text: noteText,
      source: "you",
      sourceRef: noteId,
    });

    const [p] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, "user-1"));
    viewer.current = {
      user: { id: "user-1" },
      profile: p,
      db,
      today: TODAY,
      isGuest: true,
    };

    // Remove note
    await removeNote(noteId);

    // Note is deleted from note table
    const remainingNotes = await listNotes(db, "user-1");
    expect(remainingNotes.length).toBe(0);

    // Talk context no longer contains the note
    const ctx = await buildContext(db, "user-1", TODAY);
    expect(ctx.notes?.some((n) => n.text === noteText)).toBeFalsy();

    // Current shelf item was removed entirely so stale suggestion is gone
    const currentShelf = await db
      .select()
      .from(schema.shelfItem)
      .where(eq(schema.shelfItem.status, "current"));
    expect(currentShelf.length).toBe(0);

    // Saved shelf item was kept, but its why line was cleared of the deleted note
    const [savedShelf] = await db
      .select()
      .from(schema.shelfItem)
      .where(eq(schema.shelfItem.status, "saved"));
    expect(savedShelf).toBeDefined();
    expect(open(savedShelf.whyEnc)).toBe("");

    // Memory card was deleted
    const memCards = await db
      .select()
      .from(schema.memoryCard)
      .where(eq(schema.memoryCard.id, memId));
    expect(memCards.length).toBe(0);
  });
});
