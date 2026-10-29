// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("idle guest purge", { timeout: 30_000 }, () => {
  it("deletes only guests idle for 14 days", async () => {
    const { openDb } = await import("@/server/db");
    const { purgeIdleGuests } = await import("@/server/data/guests");
    const { user, session, profile, agentRun } =
      await import("@/server/db/schema");
    const db = await openDb("memory:");

    const person = (id: string, isAnonymous: boolean) => ({
      id,
      name: id,
      email: `${id}@guest.koe.invalid`,
      isAnonymous,
      createdAt: daysAgo(30),
    });
    await db
      .insert(user)
      .values([
        person("idle-guest", true),
        person("recent-session", true),
        person("recent-ai", true),
        person("idle-account", false),
        { ...person("new-guest", true), createdAt: daysAgo(2) },
      ]);
    await db.insert(profile).values({ userId: "idle-guest" });
    await db.insert(session).values([
      {
        id: "s1",
        token: "t1",
        userId: "idle-guest",
        expiresAt: daysAgo(-10),
        updatedAt: daysAgo(20),
      },
      {
        id: "s2",
        token: "t2",
        userId: "recent-session",
        expiresAt: daysAgo(-10),
        updatedAt: daysAgo(3),
      },
    ]);
    await db.insert(agentRun).values({
      userId: "recent-ai",
      purpose: "talk",
      model: "m",
      ok: true,
      createdAt: daysAgo(1),
    });

    await purgeIdleGuests(db);

    const left = (await db.select({ id: user.id }).from(user))
      .map((r) => r.id)
      .sort();
    expect(left).toEqual([
      "idle-account",
      "new-guest",
      "recent-ai",
      "recent-session",
    ]);
    expect(
      await db.select().from(profile).where(eq(profile.userId, "idle-guest")),
    ).toEqual([]);
  });
});
