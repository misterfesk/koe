"use server";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrors, type ActionResult } from "@/domain/forms";
import { isValidTimeZone } from "@/domain/time";
import { helpResources } from "@/fixtures/help-resources";
import { auth } from "../auth";
import { db } from "../db";
import { completeSetup } from "../data/profile";
import { allow } from "../rate-limit";
import { getViewer } from "../viewer";

const setup = z.object({
  adult: z.literal("yes", {
    error: "Koe is for adults. Confirm you're 18 or older to start.",
  }),
  region: z.string().max(8),
  timezone: z.string().max(64).refine(isValidTimeZone).catch("UTC"),
});

/** One-screen setup. Creates a guest session if there isn't one yet. */
export async function start(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = setup.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const region = helpResources.some((r) => r.region === parsed.data.region)
    ? parsed.data.region
    : "OTHER";
  let userId = (await getViewer())?.user.id;
  if (!userId) {
    if (!(await allow("guest"))) return tooMany;
    const guest = await (
      await auth()
    ).api.signInAnonymous({ headers: await headers() });
    userId = guest?.user.id;
  }
  if (!userId)
    return {
      ok: false,
      errors: { form: "Koe couldn't start a session. Try again." },
    };
  await completeSetup(await db(), userId, {
    region,
    timezone: parsed.data.timezone,
  });
  redirect("/intake");
}

const credentials = z.object({
  email: z.email("Enter an email address like name@example.com."),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(128, "Use 128 characters or fewer."),
});

export type CredentialResult = ActionResult & {
  redirectTo?: string;
  transferredDrafts?: { from: string; to: string };
};

const tooMany: ActionResult = {
  ok: false,
  errors: { form: "Too many tries. Wait a few minutes and try again." },
};

function authError(error: unknown): ActionResult {
  if (error instanceof APIError) {
    const code = String(error.body?.code ?? "");
    if (code.includes("USER_ALREADY_EXISTS"))
      return {
        ok: false,
        errors: {
          email: "There's already an account with this email. Sign in instead.",
        },
      };
    if (code.includes("INVALID_EMAIL_OR_PASSWORD"))
      return {
        ok: false,
        errors: { form: "That email and password don't match an account." },
      };
    if (error.status === "TOO_MANY_REQUESTS")
      return {
        ok: false,
        errors: { form: "Too many tries. Wait a minute and try again." },
      };
  }
  return {
    ok: false,
    errors: { form: "Something went wrong. Try again in a moment." },
  };
}

/** Turns the current guest into an account; everything they made moves with them. */
export async function createAccount(
  _: unknown,
  form: FormData,
): Promise<CredentialResult> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!(await allow("sign-up", parsed.data.email))) return tooMany;
  const previous = await getViewer();
  let accountId: string;
  try {
    const result = await (
      await auth()
    ).api.signUpEmail({
      body: { ...parsed.data, name: "Koe user" },
      headers: await headers(),
    });
    accountId = result.user.id;
  } catch (error) {
    return authError(error);
  }
  if (form.get("draftHandoff") === "browser")
    return {
      ok: true,
      redirectTo: "/you/account?created=1",
      ...(previous?.isGuest && previous.user.id !== accountId
        ? { transferredDrafts: { from: previous.user.id, to: accountId } }
        : {}),
    };
  redirect("/you/account?created=1");
}

export async function signIn(
  _: unknown,
  form: FormData,
): Promise<CredentialResult> {
  const parsed = credentials
    .extend({ password: z.string().min(1, "Enter your password.").max(128) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!(await allow("sign-in", parsed.data.email))) return tooMany;
  const previous = await getViewer();
  let accountId: string;
  try {
    const result = await (
      await auth()
    ).api.signInEmail({ body: parsed.data, headers: await headers() });
    accountId = result.user.id;
  } catch (error) {
    return authError(error);
  }
  if (form.get("draftHandoff") === "browser")
    return {
      ok: true,
      redirectTo: "/today",
      ...(previous?.isGuest && previous.user.id !== accountId
        ? { transferredDrafts: { from: previous.user.id, to: accountId } }
        : {}),
    };
  redirect("/today");
}

export async function signOut() {
  await (await auth()).api.signOut({ headers: await headers() });
  redirect("/");
}
