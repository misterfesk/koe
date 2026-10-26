"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { ActionLink, Notice, PageHeading } from "@/components/ui";

export function ReflectIndex() {
  const { state } = useSession();
  const paused = state.scenario === "coaching paused";
  const active = state.steps.find((step) => step.id === state.activeId);
  // Ordered by effort: the quickest option comes first.
  const options = [
    {
      href: "/reflect/journal",
      title: "Journal",
      text: "A few words and your energy. Nothing is scored or read into.",
      show: true,
    },
    {
      href: "/reflect/conversation",
      title: "Scripted conversation",
      text: "A short fixed script. You decide whether to see a suggestion.",
      show: !paused,
    },
    {
      href: "/reflect/thoughts",
      title: "Thought reflection",
      text: "Four prompts about a moment. Skip any of them.",
      show: !paused,
    },
    {
      href: "/reflect/review",
      title: "Weekly review",
      text: active
        ? "Look back on “" + active.title + "” and decide what comes next."
        : "Look back on a step and decide what comes next.",
      show: !paused,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Reflect"
        description={
          state.energy === "low"
            ? "Low on energy? A short journal note is enough."
            : "Pick whichever takes the least effort right now."
        }
      >
        Reflect
      </PageHeading>
      {paused && (
        <>
          <Notice>
            UX preview; not a validated safety response. Ordinary coaching is
            paused. Your journal and memory cards are still available; no real
            input was assessed.
          </Notice>
          <ActionLink href="/help">Open Help & support</ActionLink>
        </>
      )}
      <ul className="rows">
        {options
          .filter((option) => option.show)
          .map((option) => (
            <li key={option.href}>
              <h2>
                <Link href={option.href}>
                  {option.title} <span aria-hidden="true">→</span>
                </Link>
              </h2>
              <p>{option.text}</p>
            </li>
          ))}
      </ul>
      <p className="meta">
        Anything you keep as a memory card is in{" "}
        <Link href="/settings/memory">Settings → Memory</Link>.
      </p>
    </>
  );
}
