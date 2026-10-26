"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { ActionLink, Notice, PageHeading } from "@/components/ui";
import { tone } from "@/domain/tone";

export function ReflectIndex() {
  const { state } = useSession();
  const paused = state.scenario === "coaching paused";
  return (
    <>
      <PageHeading
        eyebrow="Reflect"
        description={
          tone(state.appearance.tone, "reflection", state.energy).message
        }
      >
        A little space to notice.
      </PageHeading>
      {paused && (
        <>
          <Notice>
            UX preview; not a validated safety response. Ordinary coaching is
            paused. Notes and memory controls remain available; no real input
            was assessed.
          </Notice>
          <ActionLink href="/help">Open Help & support</ActionLink>
        </>
      )}
      <ul className="rows">
        {!paused && (
          <li>
            <p className="eyebrow">An optional exchange</p>
            <h2>
              <Link href="/reflect/conversation">
                Scripted conversation <span aria-hidden="true">↗</span>
              </Link>
            </h2>
            <p>
              A clearly labelled fixed script. You decide whether an idea would
              help.
            </p>
          </li>
        )}
        {!paused && (
          <li>
            <p className="eyebrow">Your own perspective</p>
            <h2>
              <Link href="/reflect/thoughts">
                Thought reflection <span aria-hidden="true">↗</span>
              </Link>
            </h2>
            <p>Optional prompts, with room to leave an alternative blank.</p>
          </li>
        )}
        <li>
          <p className="eyebrow">A session timeline</p>
          <h2>
            <Link href="/reflect/journal">
              Energy & journal <span aria-hidden="true">↗</span>
            </Link>
          </h2>
          <p>
            A note or reported energy, if useful. No scores or patterns
            inferred.
          </p>
        </li>
        {!paused && (
          <li>
            <p className="eyebrow">Change what comes next</p>
            <h2>
              <Link href="/reflect/review">
                Weekly reflection <span aria-hidden="true">↗</span>
              </Link>
            </h2>
            <p>
              Keep a plan, shrink it, switch activities or make room for human
              support.
            </p>
          </li>
        )}
        <li>
          <p className="eyebrow">Permission, in view</p>
          <h2>
            <Link href="/settings/memory">
              Approved memory <span aria-hidden="true">↗</span>
            </Link>
          </h2>
          <p>Inspect, edit, export or remove the words you chose to keep.</p>
        </li>
      </ul>
    </>
  );
}
