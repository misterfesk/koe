// @vitest-environment node
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

async function setup() {
  const { openDb } = await import("@/server/db");
  const { createAuth } = await import("@/server/auth");
  const schema = await import("@/server/db/schema");
  const db = await openDb("memory:");
  return { db, auth: createAuth(db), schema };
}

function cookieFrom(headers: Headers) {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

// Embedded Postgres start-up plus password hashing is slow under parallel load.
describe("guest accounts", { timeout: 30_000 }, () => {
  it("keeps a guest's data when they create an account", async () => {
    const { db, auth, schema } = await setup();

    const guest = await auth.api.signInAnonymous({ returnHeaders: true });
    const guestId = guest.response!.user.id;
    await db
      .insert(schema.profile)
      .values({ userId: guestId, region: "SG", timezone: "Asia/Singapore" });

    const created = await auth.api.signUpEmail({
      body: {
        email: "person@example.com",
        password: "a-long-test-password",
        name: "Person",
      },
      headers: new Headers({ cookie: cookieFrom(guest.headers) }),
    });
    const accountId = created.user.id;

    expect(accountId).not.toBe(guestId);
    const moved = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, accountId));
    expect(moved).toHaveLength(1);
    expect(moved[0].region).toBe("SG");
    // The anonymous user is removed after linking, and nothing is left behind.
    const left = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, guestId));
    expect(left).toHaveLength(0);
  });

  it("deletes all of a person's rows with the account", async () => {
    const { db, auth, schema } = await setup();
    const guest = await auth.api.signInAnonymous({ returnHeaders: true });
    const id = guest.response!.user.id;
    await db.insert(schema.profile).values({ userId: id });
    await db.insert(schema.safetyEvent).values({
      id: "e1",
      userId: id,
      level: "concern",
      source: "rules",
      surface: "test",
    });

    await db.delete(schema.user).where(eq(schema.user.id, id));

    expect(await db.select().from(schema.profile)).toHaveLength(0);
    expect(await db.select().from(schema.safetyEvent)).toHaveLength(0);
  });
});
