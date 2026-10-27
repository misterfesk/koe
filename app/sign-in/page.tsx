import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { CredentialsForm } from "@/features/account/credentials";
import { signIn } from "@/server/actions/account";
import { getViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getViewer();
  if (viewer && !viewer.isGuest) redirect("/today");
  return (
    <>
      <PageHeading
        eyebrow="Sign in"
        description={
          viewer?.isGuest
            ? "Anything you did as a guest on this browser moves into your account."
            : undefined
        }
      >
        Sign in to Koe
      </PageHeading>
      <CredentialsForm action={signIn} submitLabel="Sign in" />
      <p className="meta">
        New here? <Link href="/">Start as a guest</Link>, then make an account
        in You.
      </p>
    </>
  );
}
