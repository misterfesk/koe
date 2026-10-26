"use client";
import { CoachingPaused } from "@/components/coaching-paused";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { PageHeading, ActionLink, Notice, Select } from "@/components/ui";
import {
  getSuggestionOptions,
  makeSmaller,
  currentReport,
  hasPlannerDraft,
} from "@/domain/state";
import { tone, type Energy } from "@/domain/tone";
import styles from "./steps.module.css";
export function Today() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [handoffBlocked, setHandoffBlocked] = useState(false);
  const [shown, setShown] = useState(0);
  const active = state.steps.find((s) => s.id === state.activeId && !s.paused);
  const options = getSuggestionOptions(state);
  const option = options[shown % options.length];
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
        eyebrow={state.onboarded ? "Today · " + state.goal : "Today"}
      >
        {voice.message}
      </PageHeading>
      {state.scenario === "returning after absence" && (
        <p className="meta">Welcome back. There is nothing to catch up on.</p>
      )}
      {!active && !state.declined && !offline && (
        <Select
          label="Energy today"
          value={state.energy}
          onChange={(value) => {
            dispatch({ type: "energy", value: value as Energy });
            setShown(0);
          }}
          options={[
            { value: "unknown", label: "Prefer not to say" },
            { value: "low", label: "Low · keep things quiet" },
            { value: "steady", label: "A little room" },
            { value: "more", label: "More room today" },
          ]}
        />
      )}
      {state.declined && !active ? (
        <section className={styles.exit}>
          <span className={styles.mark} aria-hidden="true">
            ○
          </span>
          <h2>You can leave it here.</h2>
          <p>Nothing was added, and no reminder preview is set.</p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => dispatch({ type: "undecline" })}
            >
              Show the suggestion again
            </button>
            <ActionLink href="/steps/new" secondary>
              Write my own step
            </ActionLink>
          </div>
        </section>
      ) : (
        <section className="dark-panel">
          <div className={styles.topline}>
            <span className="eyebrow">
              {active
                ? "Your step"
                : offline
                  ? "Suggestions offline"
                  : "Suggestion " +
                    ((shown % options.length) + 1) +
                    " of " +
                    options.length}
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
              ? "You can write your own step, or stop here. Help & support works without suggestions."
              : active
                ? latest
                  ? "You said: " +
                    latest.outcome +
                    ". Keep the step, make it smaller, or leave it."
                  : "When you've tried it, you can say how it went. Nothing is overdue."
                : state.energy === "low"
                  ? "Rest counts as a step. Nothing here needs to be earned."
                  : "Take it as it is, make it smaller, or pick another."}
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
                    {latest ? "Open step" : "Say how it went"}{" "}
                    <span aria-hidden="true">→</span>
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
                {!active && options.length > 1 && (
                  <button
                    className="secondary"
                    onClick={() => setShown((value) => value + 1)}
                  >
                    Show another
                  </button>
                )}
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
                <ActionLink href="/steps/new" secondary>
                  Write my own
                </ActionLink>
                <button
                  className="text"
                  onClick={() => dispatch({ type: "decline" })}
                >
                  Not today
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {handoffBlocked && (
        <Notice>
          You already have a step draft. <Link href="/steps/new">Open it</Link>{" "}
          before starting another.
        </Notice>
      )}
      {!active && option.sourceMemoryId && (
        <p className="meta">
          This suggestion uses one of your memory cards.{" "}
          <Link href="/settings/memory">See Memory</Link>
        </p>
      )}
      <div className={styles.below}>
        <p className="meta">Not a step kind of day?</p>
        <ActionLink href="/reflect" secondary>
          Reflect instead <span aria-hidden="true">→</span>
        </ActionLink>
      </div>
    </>
  );
}
