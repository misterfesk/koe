"use client";
import { CoachingPaused } from "@/components/coaching-paused";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { PageHeading, ActionLink, Notice } from "@/components/ui";
import {
  getSuggestionOptions,
  makeSmaller,
  currentReport,
  hasPlannerDraft,
} from "@/domain/state";
import { tone } from "@/domain/tone";
import styles from "./steps.module.css";
export function Today() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [handoffBlocked, setHandoffBlocked] = useState(false);
  const active = state.steps.find((s) => s.id === state.activeId && !s.paused);
  const option = getSuggestionOptions(state)[0];
  const suggestion = option.title;
  const latest = currentReport(active);
  const context = latest
    ? latest.outcome === "Done"
      ? "done"
      : "setback"
    : active
      ? "chosen"
      : "welcome";
  const voice = tone(state.appearance.tone, context, state.energy);
  const offline = !state.providerEnabled && !active;
  if (state.scenario === "coaching paused")
    return <CoachingPaused eyebrow="Review-only scenario" />;
  return (
    <>
      <PageHeading
        eyebrow="Today · at your own pace"
        description={
          state.onboarded ? state.goal : "A small beginning, if you want one."
        }
      >
        {voice.message}
      </PageHeading>
      {state.scenario === "returning after absence" && (
        <p className="meta">Welcome back. There is nothing to catch up on.</p>
      )}
      {state.declined && !active ? (
        <section className={styles.exit}>
          <span className={styles.mark} aria-hidden="true">
            ○
          </span>
          <h2>You can leave it here.</h2>
          <p>No obligation. No reminders added.</p>
          <ActionLink href="/steps/new" secondary>
            Choose my own step
          </ActionLink>
          <div className="actions">
            <button
              className="text"
              onClick={() => {
                dispatch({ type: "reset", scenario: state.scenario });
              }}
            >
              Start a fresh preview
            </button>
          </div>
        </section>
      ) : (
        <section className="dark-panel">
          <div className={styles.topline}>
            <span className="eyebrow">
              {active
                ? "Your chosen step"
                : offline
                  ? "Suggestions offline"
                  : "One optional idea"}
            </span>
            <span className={styles.orbit} aria-hidden="true">
              ◌
            </span>
          </div>
          <h2 className={styles.actionTitle}>
            {offline
              ? "Suggestions are offline right now."
              : (active?.title ?? suggestion)}
          </h2>
          <p>
            {offline
              ? "You can write your own step, or stop here. Help works without them."
              : active
                ? latest
                  ? "You reported: " +
                    latest.outcome +
                    ". Any change is your choice."
                  : "Choosing is a beginning. You can tell us what happened whenever you want."
                : state.energy === "low"
                  ? "Rest counts as a choice. Nothing here needs to be earned."
                  : "A little time with something you enjoy. No result to aim for."}
          </p>
          {offline ? (
            <>
              <div className="actions">
                <ActionLink href="/steps/new">Write my own step</ActionLink>
                <ActionLink href="/help" secondary>
                  Help & support
                </ActionLink>
              </div>
            </>
          ) : (
            <>
              <div className="actions">
                {active ? (
                  <ActionLink href={"/steps/" + active.id}>
                    Open step & follow-up <span aria-hidden="true">→</span>
                  </ActionLink>
                ) : (
                  <button
                    onClick={() => {
                      dispatch({
                        type: "choose",
                        title: suggestion,
                        area: option.area,
                        prediction: "",
                        sourceMemoryId: option.sourceMemoryId,
                      });
                    }}
                  >
                    Choose this step <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
              <div className={styles.alternatives}>
                <button
                  className="secondary"
                  onClick={() => {
                    if (hasPlannerDraft(state)) {
                      setHandoffBlocked(true);
                      return;
                    }
                    dispatch({
                      type: "draft",
                      key: "step.title",
                      value: makeSmaller(active?.title ?? suggestion),
                    });
                    dispatch({
                      type: "draft",
                      key: "step.area",
                      value: active?.area ?? option.area,
                    });
                    if (!active && option.sourceMemoryId)
                      dispatch({
                        type: "draft",
                        key: "step.sourceMemoryId",
                        value: option.sourceMemoryId,
                      });
                    router.push("/steps/new");
                  }}
                >
                  Make it smaller
                </button>
                <button
                  className="secondary"
                  onClick={() => dispatch({ type: "decline" })}
                >
                  Not today
                </button>
                <ActionLink href="/steps/new" secondary>
                  Something else
                </ActionLink>
              </div>
            </>
          )}
        </section>
      )}
      {handoffBlocked && (
        <Notice>
          A planner draft is already in progress.{" "}
          <Link href="/steps/new">Inspect existing draft</Link> before starting
          another.
        </Notice>
      )}
      <div className={styles.below}>
        <p>
          One decision is enough.
          <br />
          <span className="meta">You can change your mind, or stop here.</span>
        </p>
        <ActionLink href="/reflect" secondary>
          Rather reflect?
        </ActionLink>
      </div>
      {!state.temporary && state.memoryConsent && state.memories.length > 0 && (
        <p className="meta">
          This idea uses an approved preference.{" "}
          <Link href="/settings/memory">Inspect memory</Link>
        </p>
      )}
    </>
  );
}
