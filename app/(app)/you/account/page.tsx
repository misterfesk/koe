import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeading } from "@/components/ui";
import { GuestAccount, SignOut } from "@/features/settings/preferences";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Account" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const v = await requireViewer();
  const created = (await searchParams).created === "1";
  if (v.isGuest)
    return (
      <>
        <PageHeading
          eyebrow="Settings · Account"
          description="Everything you've done so far moves into the account. Nothing is lost."
        >
          Make an account
        </PageHeading>
        <p className="prose">
          You&apos;re a guest right now. Your data is tied to this browser: if
          you clear it or switch devices, you can&apos;t get back in. An account
          lets you sign in anywhere.
        </p>
        <GuestAccount />
        <p className="meta">
          Already have an account? <Link href="/sign-in">Sign in</Link>.
          Anything from this guest session moves into it.
        </p>
      </>
    );
  return (
    <>
      <PageHeading eyebrow="Settings · Account">Your account</PageHeading>
      {created && (
        <Notice>
          Account created. Everything you did as a guest is in it.
        </Notice>
      )}
      <p>
        Signed in as <strong>{v.user.email}</strong>.
      </p>
      <p className="meta">
        Password reset by email isn&apos;t available yet. Keep your password
        somewhere safe.
      </p>
      <SignOut />
      <p className="meta" style={{ marginTop: 24 }}>
        To delete your account and everything in it, go to{" "}
        <Link href="/settings/privacy">Your data</Link>.
      </p>
    </>
  );
}
