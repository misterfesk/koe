import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="Privacy"
        description="What Koe keeps, where it goes, and how to take it back."
      >
        Privacy
      </PageHeading>
      <div className="prose">
        <h2>What Koe stores</h2>
        <p>
          Your steps, reports, notes, conversations, memory cards, people and
          reminders are stored on Koe&apos;s server so they&apos;re there next
          time. Everything you write is encrypted in the database. That protects
          it if someone gets a copy of the database. Koe&apos;s server can still
          decrypt it, to show it to you and to use AI features.
        </p>
        <p>
          If you have an account, Koe stores your email address and a hashed
          password. As a guest, Koe stores no email at all. For each signed-in
          session Koe also keeps the IP address and browser details, to keep the
          session working and secure. A guest&apos;s data stays until it&apos;s
          deleted; it doesn&apos;t expire on its own.
        </p>
        <h2>What goes to the AI provider</h2>
        <p>
          AI features use Nebius Token Factory. When you talk with Koe, ask for
          a smaller version, ask for ideas or draft a message, the text needed
          for that is sent to Nebius to write the reply. In Talk that includes
          the conversation and, if memory is on, your memory cards, recent steps
          and today&apos;s energy check-in. With memory off, only the
          conversation is sent.
        </p>
        <p>
          <strong>Not yet confirmed:</strong> how long Nebius keeps this text
          and whether it&apos;s used for anything else. Until that&apos;s
          checked, don&apos;t share anything you wouldn&apos;t want stored by a
          third party. Your steps, notes and Help work without the AI.
        </p>
        <h2>Safety checks</h2>
        <p>
          Koe checks what you write for signs you might be in danger, so it can
          point you to people who can help. When that happens, Koe records that
          a check fired and where. It doesn&apos;t record a copy of what you
          wrote. No one is contacted.
        </p>
        <h2>What Koe doesn&apos;t do</h2>
        <p>
          No ads, no analytics, no tracking cookies and no selling of data. Koe
          uses one cookie to keep you signed in. Koe never contacts anyone for
          you.
        </p>
        <h2>Your controls</h2>
        <p>
          In <Link href="/you/data">Your data</Link> you can switch chat history
          off, download everything in one file, or delete everything. Deleting
          removes it from the database straight away. Memory cards are in{" "}
          <Link href="/you/knows">What Koe knows</Link>.
        </p>
      </div>
    </>
  );
}
