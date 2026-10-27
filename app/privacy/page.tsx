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
          Your day plans, answers, notes, conversations, memory cards, people
          and reminders are stored on Koe&apos;s server so they&apos;re there
          next time. Everything you write is encrypted in the database. That
          protects it if someone gets a copy of the database. Koe&apos;s server
          can still decrypt it, to show it to you and to use AI features.
        </p>
        <p>
          If you have an account, Koe stores your email address and a hashed
          password. As a guest, Koe stores no email at all. For each signed-in
          session Koe also keeps the IP address and browser details, to keep the
          session working and secure. A guest&apos;s data stays until it&apos;s
          deleted; it doesn&apos;t expire on its own.
        </p>
        <p>
          Your Shelf keeps titles, links, choices and short why lines. Page
          excerpts aren&apos;t saved.
        </p>
        <h2>What goes to the AI provider</h2>
        <p>
          AI features use Nebius Token Factory. The text needed for each one is
          sent to Nebius to write the reply:
        </p>
        <ul>
          <li>
            <strong>Your first questions.</strong> The answers you tick and the
            words you type go to Nebius once, to write your summary and first
            day. If food or weight worry shows up in your words, the words are
            not kept.
          </li>
          <li>
            <strong>Planning your day.</strong> When Koe plans a day, changes it
            after a check-in, or makes something smaller or swaps it, Nebius
            receives your day plan. With memory on, that includes the titles and
            why lines, plus your answers, summary and memory cards. With memory
            off, it receives only the kind, size and time of each entry, never
            the titles or why lines.
          </li>
          <li>
            <strong>The check-in word.</strong> If you add one word when you
            check in, and today&apos;s energy is low or more, that word is sent
            with the planning request. A word that trips the safety check is not
            sent. With memory off, the word is still sent, because you typed it
            for that day.
          </li>
          <li>
            <strong>Talk.</strong> The conversation goes to Nebius. With memory
            on, your memory cards, recent entries from your day and today&apos;s
            energy check-in go too. With memory off, recent counts, kinds, sizes
            and times still go. Plan titles and why lines stay out.
          </li>
          <li>
            <strong>Drafts and ideas.</strong> When you ask Koe for ideas or a
            draft message, the text needed for that is sent.
          </li>
          <li>
            <strong>Shelf.</strong> Nebius receives a page&apos;s title, a short
            excerpt and fixed topics. Your words and notes aren&apos;t included.
          </li>
        </ul>
        <p>
          <strong>Not yet confirmed:</strong> how long Nebius keeps this text
          and whether it&apos;s used for anything else. Until that&apos;s
          checked, don&apos;t share anything you wouldn&apos;t want stored by a
          third party. Your day, notes and Help work without the AI.
        </p>
        <h2>What goes to web search</h2>
        <p>
          Shelf searches use fixed phrases from your choices. Your own words are
          never sent to Tavily. With memory off, automatic searches use general
          topics. Talk searches use the topics shown on the card you confirm.
        </p>
        <p>
          Tavily&apos;s storage and reuse of searches haven&apos;t been
          verified. Search phrases contain no names, notes or conversation text.
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
