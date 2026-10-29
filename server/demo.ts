import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { NextResponse } from "next/server";
import { addDays, localDay } from "@/domain/time";
import { intakeModel } from "@/domain/intake";
import { weekDay } from "@/domain/week-picker";
import type { Auth } from "./auth";
import type { Db } from "./db";
import {
  conversation,
  conversationSummary,
  memoryCard,
  message,
  session,
  verification,
} from "./db/schema";
import { commitIntroInTransaction, getPlanDay } from "./data/intake";
import { saveCheckIn } from "./data/plan";
import { completeSetup } from "./data/profile";
import { reportStep } from "./data/steps";
import { addMessage, saveSummary, startConversation } from "./data/talk";
import { addMemory } from "./data/memory";
import { saveWeekInTransaction, weekThingStates } from "./data/week";
import { openToday, planToday } from "./llm/planner";
import type { Energy, Outcome } from "@/domain/steps";
import { isLocalHost, localOnlyRefusal } from "./local-only";

const TIMEZONE = "Europe/London";
const TOKEN_TTL_MS = 60 * 60 * 1000;
const tokenKey = (token: string) =>
  `demo-enter:${createHash("sha256").update(token).digest("hex")}`;

const THINGS = [
  {
    title: "Update my CV",
    what: "Update my CV before the job closes on Friday.",
    when: "Friday",
  },
  {
    title: "Book the dentist",
    what: "Book the dentist. I keep putting off the call.",
    when: "",
  },
  {
    title: "Reply to the landlord",
    what: "Reply to the landlord about the boiler.",
    when: "",
  },
];

const TALK = [
  [
    "user",
    "I still haven't replied to the landlord. I open the email and close it again.",
  ],
  ["assistant", "What happens right before you close it?"],
  [
    "user",
    "I don't know how to say the boiler is still broken without sounding annoyed.",
  ],
  [
    "assistant",
    "Two lines could do it. The boiler still isn't working, and when can someone come? Want to try that tomorrow morning?",
  ],
] as const;

const TAKEAWAYS = [
  "The landlord reply stalls on how it might sound.",
  "Two lines could do it: the boiler, and when someone can come.",
];
const MEMORY =
  "Writing to the landlord is hard when I worry about sounding annoyed.";

/**
 * One guest whose data reads like three days of use, with the week review due
 * today. Uses the app's own data functions, so everything is stored (and
 * sealed) the way the app writes it. No AI call. Every call makes a new guest.
 */
export async function seedDemo(db: Db, auth: Auth, now = new Date()) {
  const created = await auth.api.signInAnonymous();
  const userId = created?.user.id;
  if (!userId) throw new Error("Could not create a guest.");
  // The sign-in's own session is never handed out.
  await db.delete(session).where(eq(session.userId, userId));
  await completeSetup(db, userId, { region: "GB", timezone: TIMEZONE });

  const today = localDay(TIMEZONE, now);
  const day = (n: number) => addDays(today, n);
  const model = intakeModel.parse({
    goals: ["work_study", "sleep"],
    wake: "7to9",
    lifts: ["music"],
  });

  // Day 1 (today-3) is the intro day; the week started four days earlier.
  await db.transaction(async (tx) => {
    const week = await saveWeekInTransaction(tx, userId, {
      draft: { items: THINGS.map((captured) => ({ captured })) },
      today: day(-7),
      eatingConcern: false,
    });
    const things = await weekThingStates(tx, userId);
    await commitIntroInTransaction(tx, userId, {
      model,
      summary:
        "You're working on your CV, the dentist and a reply to your landlord. Music helps you get going.",
      memories: [],
      people: [],
      // All three things on day 1, so each one has an answer that day.
      items: weekDay({ things, energy: "more", lighter: false, model }),
      memoryOn: true,
      today: day(-3),
    });
    if (week.items.length !== 3) throw new Error("Week not saved.");
  });

  const answer = async (d: string, title: string, outcome: Outcome) => {
    const plan = await getPlanDay(db, userId, d);
    const item = plan?.items.find((i) => i.title === title && i.stepId);
    if (!item?.stepId) throw new Error(`${title} is not planned on ${d}.`);
    await reportStep(db, userId, item.stepId, outcome, d);
  };
  const checkIn = async (d: string, energy: Energy) => {
    await saveCheckIn(db, userId, d, energy, null);
    await planToday(userId, { reason: "check_in", energy }, { db, today: d });
  };

  // Day 1: the low check-in is saved after the answers, so the plan they
  // answered stays as it was (a low check-in would cut it to one thing).
  await answer(day(-3), "Book the dentist", "done");
  await answer(day(-3), "Reply to the landlord", "not");
  await saveCheckIn(db, userId, day(-3), "low", null);

  // Days 2 and 3: the real deterministic week path, then the check-in.
  await openToday(userId, { db, today: day(-2) });
  await checkIn(day(-2), "okay");
  await answer(day(-2), "Update my CV", "partly");

  await openToday(userId, { db, today: day(-1) });
  await checkIn(day(-1), "more");
  await answer(day(-1), "Update my CV", "partly");
  await answer(day(-1), "Reply to the landlord", "not");

  // Yesterday's Talk, opened from the landlord thing.
  const landlord = (await weekThingStates(db, userId)).find(
    (t) => t.title === "Reply to the landlord",
  );
  const conversationId = await startConversation(
    db,
    userId,
    "talk",
    "The landlord email",
    landlord ? { kind: "thing", id: landlord.id } : undefined,
  );
  let last = "";
  for (const [role, text] of TALK)
    last = (await addMessage(db, userId, conversationId, role, text)).id;
  await saveSummary(db, userId, conversationId, TAKEAWAYS, last);
  await addMemory(db, userId, {
    kind: "hard",
    text: MEMORY,
    source: "talk",
    sourceRef: conversationId,
  });

  // Date yesterday's rows to yesterday evening (UTC midday keeps the London date).
  const at = (minute: number) =>
    new Date(Date.parse(`${day(-1)}T18:00:00Z`) + minute * 60_000);
  await db
    .update(conversation)
    .set({ createdAt: at(0), updatedAt: at(6) })
    .where(
      and(eq(conversation.id, conversationId), eq(conversation.userId, userId)),
    );
  const rows = await db
    .select({ id: message.id })
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationId),
        eq(message.userId, userId),
      ),
    )
    .orderBy(message.createdAt);
  for (const [i, row] of rows.entries())
    await db
      .update(message)
      .set({ createdAt: at(i * 2) })
      .where(eq(message.id, row.id));
  await db
    .update(conversationSummary)
    .set({ createdAt: at(7) })
    .where(eq(conversationSummary.conversationId, conversationId));
  await db
    .update(memoryCard)
    .set({ createdAt: at(8), updatedAt: at(8) })
    .where(
      and(
        eq(memoryCard.userId, userId),
        eq(memoryCard.sourceRef, conversationId),
      ),
    );

  return { userId, token: await issueDemoToken(db, userId, now) };
}

/** A one-time sign-in token for this guest, kept only as a SHA-256 hash. */
export async function issueDemoToken(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: tokenKey(token),
    value: userId,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  });
  return token;
}

/** Uses up a token once. Returns the guest's id, or null if unknown, used or expired. */
export async function consumeDemoToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, tokenKey(token)),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .returning({ userId: verification.value });
  return row?.userId ?? null;
}

/**
 * A normal better-auth session for the guest, as a signed cookie the
 * caller sets. Built with better-auth's own adapter and cookie settings.
 */
export async function demoSessionCookie(auth: Auth, userId: string) {
  const ctx = await auth.$context;
  // Only a guest can be entered this way, never an account.
  const user = (await ctx.internalAdapter.findUserById(userId)) as {
    isAnonymous?: boolean | null;
  } | null;
  if (!user?.isAnonymous) return null;
  const created = await ctx.internalAdapter.createSession(userId);
  if (!created) return null;
  const cookie = ctx.authCookies.sessionToken;
  return {
    name: cookie.name,
    value: `${created.token}.${await makeSignature(created.token, ctx.secret)}`,
    options: {
      ...cookie.attributes,
      maxAge: ctx.sessionConfig.expiresIn,
    },
  };
}

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * GET /api/demo/enter?token=…: signs the browser in as the seeded guest and
 * opens Today. Local only: 404 unless the local guards hold now and the
 * request names this machine. Any failure is a bare 404.
 */
export async function enterDemo(
  request: Request,
  deps: () => Promise<{ db: Db; auth: Auth }>,
) {
  try {
    if (localOnlyRefusal()) return notFound();
    const url = new URL(request.url);
    if (!isLocalHost(request.headers.get("host") ?? url.host))
      return notFound();
    if (!isLocalHost(url.hostname)) return notFound();
    const token = url.searchParams.get("token") ?? "";
    const { db, auth } = await deps();
    const userId = await consumeDemoToken(db, token);
    if (!userId) return notFound();
    const cookie = await demoSessionCookie(auth, userId);
    if (!cookie) return notFound();
    const res = NextResponse.redirect(new URL("/today", url), 303);
    res.headers.set("cache-control", "no-store");
    res.cookies.set(cookie.name, cookie.value, {
      path: cookie.options.path ?? "/",
      httpOnly: cookie.options.httpOnly ?? true,
      secure: cookie.options.secure ?? false,
      sameSite: "lax",
      maxAge: cookie.options.maxAge,
    });
    return res;
  } catch {
    return notFound();
  }
}
