// @vitest-environment node
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

beforeAll(() => {
  process.env.NEBIUS_API_KEY = "test-key-not-used-in-this-suite";
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.APP_URL = "http://127.0.0.1:3200";
  process.env.KOE_AI = "off";
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const { openDb } = await import("@/server/db");
  const { createAuth } = await import("@/server/auth");
  const db = await openDb("memory:");
  return { db, auth: createAuth(db) };
}

describe("local-only guards", () => {
  it("refuses a non-local app, a remote database and production", async () => {
    const { localOnlyRefusal } = await import("@/server/local-only");
    const ok = {
      APP_URL: "http://127.0.0.1:3200",
      DATABASE_URL: "file:./.data/x",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv;
    expect(localOnlyRefusal(ok)).toBeNull();
    expect(
      localOnlyRefusal({ ...ok, DATABASE_URL: "postgres://u:p@localhost/k" }),
    ).toBeNull();
    for (const APP_URL of [
      "https://koe.example",
      "http://koe.example:3200",
      "https://127.0.0.1:3200",
      "http://127.0.0.1.example",
    ])
      expect(localOnlyRefusal({ ...ok, APP_URL })).toMatch(/APP_URL/);
    for (const DATABASE_URL of [
      "postgres://u:p@db.example.com:5432/koe",
      "postgres://u:p@localhost/koe?host=db.example.com",
      "memory:",
      "mysql://localhost/koe",
    ])
      expect(localOnlyRefusal({ ...ok, DATABASE_URL })).toMatch(/DATABASE_URL/);
    expect(localOnlyRefusal({ ...ok, NODE_ENV: "production" })).toMatch(
      /production/,
    );
  });
});

describe("demo seed", { timeout: 120_000 }, () => {
  it("seeds a guest with a due week, three past days and yesterday's Talk", async () => {
    const { db, auth } = await setup();
    const { seedDemo } = await import("@/server/demo");
    const { localDay, addDays } = await import("@/domain/time");
    const { listWeeks } = await import("@/server/data/week");
    const { getPlanDay } = await import("@/server/data/intake");
    const { getCheckInView } = await import("@/server/data/plan");
    const { listConversations, getConversation, getSummary } =
      await import("@/server/data/talk");
    const { listMemory } = await import("@/server/data/memory");
    const schema = await import("@/server/db/schema");
    const { reviewDue } = await import("@/domain/week");
    const { open } = await import("@/server/crypto");

    const { userId, token } = await seedDemo(db, auth);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const today = localDay("Europe/London");
    const day = (n: number) => addDays(today, n);

    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    expect(user.isAnonymous).toBe(true);
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, userId));
    expect(profile.onboardedAt).toBeTruthy();
    expect(profile.timezone).toBe("Europe/London");
    // No session from the sign-in is left lying around.
    expect(
      await db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, userId)),
    ).toHaveLength(0);

    const weeks = await listWeeks(db, userId);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].startedOn).toBe(day(-7));
    expect(weeks[0].reviewOn).toBe(today);
    expect(reviewDue(weeks[0], today)).toBe(true);
    expect(weeks[0].items.map((i) => i.captured.title)).toEqual([
      "Update my CV",
      "Book the dentist",
      "Reply to the landlord",
    ]);
    expect(weeks[0].items[0].captured.when).toBe("Friday");

    expect((await getCheckInView(db, userId, day(-3)))?.energy).toBe("low");
    expect((await getCheckInView(db, userId, day(-2)))?.energy).toBe("okay");
    expect((await getCheckInView(db, userId, day(-1)))?.energy).toBe("more");
    expect(await getCheckInView(db, userId, today)).toBeNull();
    for (const n of [-3, -2, -1])
      expect(await getPlanDay(db, userId, day(n))).not.toBeNull();
    expect(await getPlanDay(db, userId, today)).toBeNull();

    const titleOf = new Map(
      weeks[0].items.map((i) => [i.id, i.captured.title]),
    );
    const reports = await db
      .select({
        day: schema.stepReport.day,
        outcome: schema.stepReport.outcome,
        weekItemId: schema.step.weekItemId,
      })
      .from(schema.stepReport)
      .innerJoin(schema.step, eq(schema.step.id, schema.stepReport.stepId))
      .where(eq(schema.stepReport.userId, userId));
    const answers = reports
      .map((r) => `${r.day} ${titleOf.get(r.weekItemId ?? "")} ${r.outcome}`)
      .sort();
    expect(answers).toEqual(
      [
        `${day(-3)} Book the dentist done`,
        `${day(-3)} Reply to the landlord not`,
        `${day(-2)} Update my CV partly`,
        `${day(-1)} Update my CV partly`,
        `${day(-1)} Reply to the landlord not`,
      ].sort(),
    );

    const talks = await listConversations(db, userId);
    expect(talks).toHaveLength(1);
    const talk = await getConversation(db, userId, talks[0].id);
    expect(talk?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    const [convRow] = await db
      .select()
      .from(schema.conversation)
      .where(eq(schema.conversation.id, talks[0].id));
    expect(localDay("Europe/London", convRow.updatedAt)).toBe(day(-1));
    const summary = await getSummary(db, userId, talks[0].id);
    expect(summary?.takeaways.length).toBeGreaterThan(0);
    expect(summary?.uptoMessageId).toBe(talk?.messages.at(-1)?.id);
    const cards = await listMemory(db, userId);
    expect(cards).toHaveLength(1);
    expect(cards[0].source).toBe("talk");
    const [card] = await db
      .select()
      .from(schema.memoryCard)
      .where(eq(schema.memoryCard.userId, userId));
    expect(card.sourceRef).toBe(talks[0].id);
    // Stored sealed, the way the app writes it.
    expect(card.textEnc).not.toContain("landlord");
    expect(open(card.textEnc)).toContain("landlord");
    // No copy tells in the seeded lines.
    for (const line of [
      ...(talk?.messages.map((m) => m.content) ?? []),
      ...(summary?.takeaways ?? []),
    ])
      expect(line).not.toMatch(/—|!/);

    // A second run is a separate guest; the first one's data is untouched.
    const again = await seedDemo(db, auth);
    expect(again.userId).not.toBe(userId);
    expect(again.token).not.toBe(token);
    expect(await listWeeks(db, userId)).toHaveLength(1);
    expect(await listWeeks(db, again.userId)).toHaveLength(1);
    expect(await listConversations(db, userId)).toHaveLength(1);
  });
});

describe("demo enter route", { timeout: 60_000 }, () => {
  it("signs in only the seeded guest, once, and only locally", async () => {
    const { db, auth } = await setup();
    const { enterDemo, issueDemoToken } = await import("@/server/demo");
    const schema = await import("@/server/db/schema");
    const deps = async () => ({ db, auth });
    const guest = await auth.api.signInAnonymous();
    const guestId = guest!.user.id;
    const other = await auth.api.signInAnonymous();
    const local = (token: string) =>
      new Request(`http://127.0.0.1:3200/api/demo/enter?token=${token}`);

    vi.stubEnv("DATABASE_URL", "file:./.data/v3-a7b-builder");
    expect((await enterDemo(local("x".repeat(43)), deps)).status).toBe(404);
    expect((await enterDemo(local(""), deps)).status).toBe(404);

    const expired = await issueDemoToken(
      db,
      guestId,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
    );
    expect((await enterDemo(local(expired), deps)).status).toBe(404);

    // Guards are checked at request time.
    const token = await issueDemoToken(db, guestId);
    vi.stubEnv("NODE_ENV", "production");
    expect((await enterDemo(local(token), deps)).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "https://koe.example");
    expect((await enterDemo(local(token), deps)).status).toBe(404);
    vi.stubEnv("APP_URL", "http://127.0.0.1:3200");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.example.com/koe");
    expect((await enterDemo(local(token), deps)).status).toBe(404);
    vi.stubEnv("DATABASE_URL", "file:./.data/v3-a7b-builder");
    expect(
      (
        await enterDemo(
          new Request(`http://koe.example/api/demo/enter?token=${token}`),
          deps,
        )
      ).status,
    ).toBe(404);

    const res = await enterDemo(local(token), deps);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/today");
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(res.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    const signedIn = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(signedIn?.user.id).toBe(guestId);
    const sessions = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, other!.user.id));
    expect(sessions).toHaveLength(1);

    // Works once.
    expect((await enterDemo(local(token), deps)).status).toBe(404);
    // Only the hash is stored.
    const rows = await db
      .select()
      .from(schema.verification)
      .where(and(eq(schema.verification.value, guestId)));
    expect(rows.every((r) => !r.identifier.includes(token))).toBe(true);
  });
});
