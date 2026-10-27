import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "About Koe" };

export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="About"
        description="A self-help tool for adults with low mood, built on behavioural activation."
      >
        About Koe
      </PageHeading>
      <div className="prose">
        <h2>The idea</h2>
        <p>
          Low mood makes it harder to do the things that usually help, and doing
          less tends to make mood lower. One of the best-studied ways out of
          that loop is behavioural activation: picking small, ordinary
          activities that bring a little enjoyment or a sense of getting
          somewhere, planning when you&apos;ll do them, and noticing how they
          actually went.
        </p>
        <p>
          Koe is built around that. It plans a short day from what you tell it.
          You tap to say how each thing went. The plan follows your energy, and
          the look-back shows you what tends to help.
        </p>
        <h2>What Koe isn&apos;t</h2>
        <p>
          Koe is an AI tool, not a therapist, doctor or crisis service. It
          can&apos;t diagnose or treat anything, can make mistakes, and
          can&apos;t check on you or contact anyone. If you might be in danger,
          use <Link href="/help">Help</Link>.
        </p>
        <p>
          Self-help like this works for some people and not others, and no one
          has tested Koe itself in a trial yet. If you&apos;ve felt low for more
          than a couple of weeks, or it&apos;s getting worse, please talk to a
          doctor too.
        </p>
        <h2>No tricks</h2>
        <p>
          No streaks, points or guilt. Koe doesn&apos;t try to keep you in the
          app: a short visit that ends in one small thing done is the point.
        </p>
      </div>
    </>
  );
}
