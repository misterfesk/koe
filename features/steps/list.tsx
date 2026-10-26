"use client";
import Link from "next/link";
import { useSession } from "@/components/session";
import { PageHeading, ActionLink, Empty } from "@/components/ui";
export function StepList() {
  const { state, dispatch } = useSession();
  const reported = state.steps.some((p) => p.reports.length > 0);
  return (
    <>
      <PageHeading
        eyebrow="Steps"
        description={
          state.steps.length
            ? "Pick which one shows on Today, pause one, or add another. Nothing is overdue."
            : undefined
        }
      >
        Your steps
      </PageHeading>
      <div className="actions">
        <ActionLink href="/steps/new">
          Write a step <span aria-hidden="true">＋</span>
        </ActionLink>
        <ActionLink href="/steps/routines" secondary>
          Routines
        </ActionLink>
        {reported && (
          <ActionLink href="/reflect/review" secondary>
            Weekly review
          </ActionLink>
        )}
      </div>
      {state.steps.length === 0 ? (
        <Empty>
          No steps yet. Choose{" "}
          <Link href="/today">today&apos;s suggestion</Link> or write your own.
        </Empty>
      ) : (
        <ul className="rows">
          {state.steps.map((p) => (
            <li key={p.id}>
              <p className="eyebrow">
                {p.area}
                {p.routine ? " · Routine" : ""}
              </p>
              <h2>
                <Link href={"/steps/" + p.id}>{p.title}</Link>
              </h2>
              <p className="meta">
                {p.paused
                  ? "Paused"
                  : (p.reports.at(-1)?.version === p.version
                      ? "You said: " + p.reports.at(-1)?.outcome
                      : "Not reported yet") +
                    (p.id === state.activeId ? " · On Today" : "")}
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => dispatch({ type: "pauseStep", id: p.id })}
                >
                  {p.paused ? "Resume step" : "Pause step"}
                </button>
                {!p.paused && p.id !== state.activeId && (
                  <button
                    className="text"
                    onClick={() => dispatch({ type: "active", id: p.id })}
                  >
                    Show on Today
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
