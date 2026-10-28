import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "You" };

export default async function Page() {
  const v = await requireViewer();
  const rows: [string, string, string][] = [
    [
      "What Koe knows",
      "Your saved answers, summary and memory cards.",
      "/you/knows",
    ],
    [
      "People in your corner",
      "Reach out to someone, and keep track of who you'd contact.",
      "/you/people",
    ],
    [
      "Prepare for an appointment",
      "A short summary of how things have been, and what you want to ask.",
      "/you/care",
    ],
    [
      "Look back",
      "Your week, and everything you've done and noticed so far.",
      "/you/look-back",
    ],
    ["Notes", "Write down what's on your mind.", "/you/notes"],
    ["Reminders", "Reminders you set, and quiet hours.", "/you/reminders"],
    [
      "Your data",
      "Chat history, export everything, or delete everything.",
      "/you/data",
    ],
    [
      "Account",
      v.isGuest
        ? "You're using Koe as a guest. Make an account so you don't lose your data."
        : "Signed in as " + v.user.email,
      "/you/account",
    ],
    [
      "Appearance",
      "Koe's voice, plain view, motion and the mascot.",
      "/you/appearance",
    ],
    ["Place", "Your region and timezone.", "/you/place"],
  ];
  return (
    <>
      <PageHeading eyebrow="You">You</PageHeading>
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
    </>
  );
}
