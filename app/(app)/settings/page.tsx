import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { Place } from "@/features/settings/preferences";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const v = await requireViewer();
  const rows: [string, string, string][] = [
    [
      "Account",
      v.isGuest
        ? "You're using Koe as a guest. Make an account so you don't lose your data."
        : "Signed in as " + v.user.email,
      "/settings/account",
    ],
    [
      "About me",
      "The memory cards Koe uses to suggest steps that fit you.",
      "/settings/memory",
    ],
    [
      "Reminders",
      "Reminders you set for your steps, and quiet hours.",
      "/settings/reminders",
    ],
    [
      "Appearance",
      "Koe's voice, plain view, motion and the mascot.",
      "/settings/appearance",
    ],
    [
      "Your data",
      "Chat history, export everything, or delete everything.",
      "/settings/privacy",
    ],
  ];
  return (
    <>
      <PageHeading eyebrow="Settings">Settings</PageHeading>
      <ul className="rows">
        {rows.map(([title, description, href]) => (
          <li key={href}>
            <h2>
              <Link href={href}>
                {title} <span aria-hidden="true">→</span>
              </Link>
            </h2>
            <p className="meta">{description}</p>
          </li>
        ))}
      </ul>
      <section aria-labelledby="place" style={{ marginTop: 32 }}>
        <h2 id="place">Where you are</h2>
        <Place
          region={v.profile.region ?? "OTHER"}
          timezone={v.profile.timezone}
        />
      </section>
    </>
  );
}
