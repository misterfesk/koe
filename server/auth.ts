import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { headers } from "next/headers";
import { db, type Db } from "./db";
import { transferOwnership } from "./db/ownership";
import * as schema from "./db/schema";
import { env } from "./env";

export function createAuth(database: Db) {
  return betterAuth({
    appName: "Koe",
    baseURL: env().APP_URL,
    secret: env().AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // No email provider is configured yet. Verification and reset by email
      // must be switched on before Koe is hosted for other people.
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    plugins: [
      // Guests get a real (anonymous) user row, so everything they do is
      // stored the same way and moves over intact when they create an account.
      anonymous({
        emailDomainName: "guest.koe.invalid",
        generateName: () => "Guest",
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await transferOwnership(
            database,
            anonymousUser.user.id,
            newUser.user.id,
          );
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const g = globalThis as unknown as { __koeAuth?: Promise<Auth> };

export function auth(): Promise<Auth> {
  g.__koeAuth ??= db().then(createAuth);
  return g.__koeAuth;
}

/** The signed-in person (account or guest) for this request, or null. */
export async function currentUser() {
  const session = await (
    await auth()
  ).api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}
