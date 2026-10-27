// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

async function setup() {
  const { openDb } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  const users = ["a", "b"];
  for (const id of users)
    await db
      .insert(schema.user)
      .values({ id, name: id, email: id + "@example.com" });
  return { db, schema };
}

const TODAY = "2026-10-26";

describe("step records", { timeout: 30_000 }, () => {
  it("creates, reports, undoes and revises a step", async () => {
    const { db } = await setup();
    const steps = await import("@/server/data/steps");
    const id = await steps.createStep(
      db,
      "a",
      {
        area: "move",
        title: "Walk to the corner",
        cue: "After lunch",
        when: "today",
      },
      TODAY,
    );
    let s = await steps.getStep(db, "a", id);
    expect(s?.title).toBe("Walk to the corner");
    expect(s?.plannedFor).toBe(TODAY);
    expect(s?.versions).toHaveLength(1);

    const r1 = await steps.reportStep(db, "a", id, "done", TODAY);
    s = await steps.getStep(db, "a", id);
    expect(s?.status).toBe("finished");
    // A second tap the same day changes the answer, not the count.
    const r2 = await steps.reportStep(db, "a", id, "partly", TODAY);
    expect(r2).toBe(r1);
    s = await steps.getStep(db, "a", id);
    expect(s?.reports).toHaveLength(1);
    expect(s?.status).toBe("active");

    await steps.addReportDetail(db, "a", r1!, {
      helped: "helped",
      barrier: "It rained",
    });
    s = await steps.getStep(db, "a", id);
    expect(s?.reports[0]).toMatchObject({
      helped: "helped",
      barrier: "It rained",
    });

    await steps.reviseStep(db, "a", id, { title: "Walk to the door" });
    s = await steps.getStep(db, "a", id);
    expect(s?.version).toBe(2);
    expect(s?.versions.map((v) => v.title)).toEqual([
      "Walk to the corner",
      "Walk to the door",
    ]);
    // The earlier report keeps the version it was about.
    expect(s?.reports[0].version).toBe(1);

    await steps.undoReport(db, "a", r1!);
    s = await steps.getStep(db, "a", id);
    expect(s?.reports).toHaveLength(0);
  });

  it("never shows or changes another person's records", async () => {
    const { db } = await setup();
    const steps = await import("@/server/data/steps");
    const id = await steps.createStep(
      db,
      "a",
      { area: "do", title: "Mine", when: "today" },
      TODAY,
    );
    expect(await steps.getStep(db, "b", id)).toBeNull();
    expect(await steps.listSteps(db, "b")).toHaveLength(0);
    expect(await steps.reportStep(db, "b", id, "done", TODAY)).toBeNull();
    expect(await steps.deleteStep(db, "b", id)).toBe(false);
    expect(await steps.getStep(db, "a", id)).not.toBeNull();
  });

  it("stores free text encrypted, never in plain text", async () => {
    const { db, schema } = await setup();
    const steps = await import("@/server/data/steps");
    const notes = await import("@/server/data/notes");
    await steps.createStep(
      db,
      "a",
      {
        area: "care",
        title: "Secret plan words",
        cue: "Secret cue",
        when: "today",
      },
      TODAY,
    );
    await notes.addNote(db, "a", { text: "Secret note words" });
    const raw = JSON.stringify([
      await db.select().from(schema.step),
      await db.select().from(schema.stepVersion),
      await db.select().from(schema.note),
    ]);
    expect(raw).not.toMatch(/Secret/);
    expect(raw).toMatch(/v1\./);
  });

  it("lets go of old unreported one-off steps for a fresh start", async () => {
    const { db } = await setup();
    const steps = await import("@/server/data/steps");
    const old = await steps.createStep(
      db,
      "a",
      { area: "do", title: "Old", when: "today" },
      "2026-10-01",
    );
    const fresh = await steps.createStep(
      db,
      "a",
      { area: "do", title: "Fresh", when: "today" },
      TODAY,
    );
    expect(await steps.letGoOfOld(db, "a", TODAY)).toBe(1);
    expect((await steps.getStep(db, "a", old))?.status).toBe("archived");
    expect((await steps.getStep(db, "a", fresh))?.status).toBe("active");
  });
});

describe("accounts", { timeout: 30_000 }, () => {
  it("moves every kind of guest record to the account", async () => {
    const { db, schema } = await setup();
    const { transferOwnership } = await import("@/server/db/ownership");
    const steps = await import("@/server/data/steps");
    const profile = await import("@/server/data/profile");
    const memory = await import("@/server/data/memory");
    const talk = await import("@/server/data/talk");
    const id = await steps.createStep(
      db,
      "a",
      { area: "do", title: "Guest step", when: "today" },
      TODAY,
    );
    await steps.reportStep(db, "a", id, "done", TODAY);
    await profile.setCheckIn(db, "a", TODAY, "low");
    await profile.setCheckIn(db, "b", TODAY, "more");
    await memory.addMemory(db, "a", {
      kind: "helps",
      text: "Walks",
      source: "you",
    });
    const c = await talk.startConversation(db, "a", "talk", "Hi");
    await talk.addMessage(db, "a", c, "user", "Hello");

    await transferOwnership(db, "a", "b");

    expect(await steps.listSteps(db, "b")).toHaveLength(1);
    expect((await steps.listSteps(db, "b"))[0].reports).toHaveLength(1);
    expect(await memory.listMemory(db, "b")).toHaveLength(1);
    expect((await talk.getConversation(db, "b", c))?.messages).toHaveLength(1);
    // The account's own check-in wins the clash.
    expect(await profile.getCheckIn(db, "b", TODAY)).toBe("more");
    for (const table of schema.movableTables) {
      const [row] = (
        await db.execute(
          sql`select count(*)::int as n from ${table} where user_id = 'a'`,
        )
      ).rows as { n: number }[];
      expect(row.n).toBe(0);
    }
  });

  it("deletes every record with the account", async () => {
    const { db, schema } = await setup();
    const steps = await import("@/server/data/steps");
    const notes = await import("@/server/data/notes");
    const people = await import("@/server/data/people");
    const reminders = await import("@/server/data/reminders");
    const id = await steps.createStep(
      db,
      "a",
      { area: "do", title: "Step", when: "today" },
      TODAY,
    );
    await reminders.setReminder(
      db,
      "a",
      { stepId: id, minuteOfDay: 600, days: [1] },
      "UTC",
    );
    await notes.addNote(db, "a", { text: "Note" });
    await people.addPerson(db, "a", { name: "Sam", channel: "message" });

    await db.delete(schema.user).where(eq(schema.user.id, "a"));

    for (const table of schema.movableTables) {
      const [row] = (
        await db.execute(sql`select count(*)::int as n from ${table}`)
      ).rows as { n: number }[];
      expect(row.n).toBe(0);
    }
  });
});
