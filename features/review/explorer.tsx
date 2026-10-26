"use client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useSession } from "@/components/session";
import { PageHeading, Select, Notice } from "@/components/ui";
import { scenarios, type Scenario } from "@/domain/state";
import { featureLinks, REVIEW_ENABLED } from "@/fixtures/review";
export function ReviewExplorer() {
  const { state, dispatch } = useSession();
  if (!REVIEW_ENABLED) notFound();
  return (
    <>
      <PageHeading
        eyebrow="Review tools"
        description="Every candidate feature, and scenarios to test them in. All people and histories are fictional."
      >
        Review explorer
      </PageHeading>
      <div className="panel">
        <Select
          label="Fictional scenario"
          value={state.scenario}
          options={scenarios.map((s) => ({ value: s, label: s }))}
          onChange={(value) =>
            dispatch({ type: "reset", scenario: value as Scenario })
          }
        />
        <p className="hint">
          Switching scenarios clears this session, including drafts.
        </p>
        <button
          className="secondary"
          onClick={() => dispatch({ type: "reset", scenario: state.scenario })}
        >
          Reset this scenario
        </button>
      </div>
      <Notice>
        Review build only. No live AI, outreach, scheduling, accounts or saved
        browser data.
      </Notice>
      <ul className="rows">
        {featureLinks.map(([id, label, href]) => (
          <li key={id}>
            <Link href={href}>
              <span className="meta">{id} / </span>
              <strong>{label}</strong> <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
