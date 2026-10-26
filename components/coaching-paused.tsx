"use client";

import { ActionLink, Notice, PageHeading } from "@/components/ui";

/** Review-only "coaching paused" scenario: every coaching surface steps aside for Help (D022). */
export function CoachingPaused({
  eyebrow,
  note,
}: {
  eyebrow: string;
  note?: string;
}) {
  return (
    <>
      <PageHeading eyebrow={eyebrow}>Ordinary coaching is paused.</PageHeading>
      <Notice>
        UX preview; not a validated safety response. No real input was assessed.
        {note ? " " + note : ""}
      </Notice>
      <ActionLink href="/help">Open Help & support</ActionLink>
    </>
  );
}
