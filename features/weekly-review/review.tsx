"use client";

import { CoachingPaused } from "@/components/coaching-paused";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
  Empty,
  Field,
  Notice,
  PageHeading,
  Select,
  focusFirstInvalid,
} from "@/components/ui";
import { currentReport, makeSmaller } from "@/domain/state";
import { reviewActions } from "@/domain/review";
import { tone } from "@/domain/tone";

const reviewInput = z.object({
  functionNote: z.string().trim().max(500, "Use 500 characters or fewer."),
  effort: z.enum(["", "less", "manageable", "more", "unknown"]),
  helpfulness: z.enum(["", "helpful", "mixed", "unhelpful", "unknown"]),
  choice: z.enum(["continue", "shrink", "switch", "support"]),
});

export function WeeklyReview() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [targetId, setTargetId] = useDraft(
    "weekly.draft.target",
    state.activeId || state.steps[0]?.id || "",
  );
  const target = state.steps.find((step) => step.id === targetId);
  const [functionNote, setFunctionNote] = useDraft("weekly.draft.function");
  const [effort, setEffort] = useDraft("weekly.draft.effort");
  const [helpfulness, setHelpfulness] = useDraft("weekly.draft.helpfulness");
  const [choice, setChoice] = useDraft("weekly.draft.choice");
  const [adjustment, setAdjustment] = useDraft(
    "weekly.draft.adjustment",
    target ? makeSmaller(target.title) : "",
  );
  const [result, setResult] = useDraft("weekly.result");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const report = currentReport(target);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    // A repeat submit of the just-applied (now cleared) form is a no-op, not a validation error.
    if (result && !choice && !functionNote && !effort && !helpfulness) return;
    const parsed = reviewInput.safeParse({
      functionNote,
      effort,
      helpfulness,
      choice,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.path[0] === "choice"
              ? "Choose a next approach, or leave without changing the plan."
              : issue.message,
          ]),
        ),
      );
      focusFirstInvalid(e);
      return;
    }
    const change = reviewActions(target, parsed.data.choice, adjustment);
    if (!change.ok) {
      setErrors({ adjustment: change.message });
      focusFirstInvalid(e);
      return;
    }
    setErrors({});
    dispatch({
      type: "draft",
      key: "weekly.saved",
      value: JSON.stringify({
        ...parsed.data,
        title: target.title,
        version: target.version,
        at: state.clock,
      }),
    });
    change.actions.forEach(dispatch);
    dispatch({ type: "clearDraft", prefix: "weekly.draft." });
    setResult(change.message);
    if (change.route) router.push(change.route);
    else
      requestAnimationFrame(() =>
        document.getElementById("weekly-feedback")?.focus(),
      );
  }

  if (state.scenario === "coaching paused")
    return <CoachingPaused eyebrow="Weekly review · review scenario" />;
  return (
    <>
      <PageHeading
        eyebrow="Reflect · optional weekly review"
        description={
          tone(state.appearance.tone, "review", state.energy).message
        }
      >
        A check-in that can change the plan.
      </PageHeading>
      <p className="prose">
        No score or schedule to keep up with. Describe what the action made room
        for, if anything, then choose what happens next.
      </p>
      {state.steps.length === 0 ? (
        <>
          <Empty>
            No chosen step to review yet. There is nothing to catch up on.
          </Empty>
          <div className="actions">
            <ActionLink href="/steps/new">Choose an optional step</ActionLink>
            <ActionLink href="/today" secondary>
              Leave the review
            </ActionLink>
          </div>
        </>
      ) : (
        <div className="split">
          <form onSubmit={submit} noValidate>
            <Select
              label="Plan to review"
              value={targetId}
              onChange={(value) => {
                setTargetId(value);
                dispatch({
                  type: "clearDraft",
                  prefix: "weekly.draft.adjustment",
                });
              }}
              options={[
                { value: "", label: "Choose a plan" },
                ...state.steps.map((step) => ({
                  value: step.id,
                  label: step.title + (step.paused ? " (paused)" : ""),
                })),
              ]}
            />
            {!target ? (
              <Empty>
                This selected plan is no longer available. Choose another, or
                leave the review.
              </Empty>
            ) : (
              <>
                <Field
                  label="What did this make room for? (optional)"
                  value={functionNote}
                  onChange={setFunctionNote}
                  multiline
                  maxLength={500}
                  error={errors.functionNote}
                />
                <Select
                  label="Effort (optional)"
                  value={effort}
                  onChange={setEffort}
                  error={errors.effort}
                  options={[
                    { value: "", label: "Leave this open" },
                    { value: "less", label: "Less than I expected" },
                    { value: "manageable", label: "Manageable for me" },
                    { value: "more", label: "More than I wanted" },
                    { value: "unknown", label: "Prefer not to say" },
                  ]}
                />
                <Select
                  label="Helpfulness (optional)"
                  value={helpfulness}
                  onChange={setHelpfulness}
                  error={errors.helpfulness}
                  options={[
                    { value: "", label: "Leave this open" },
                    { value: "helpful", label: "Useful to me" },
                    { value: "mixed", label: "Mixed / hard to tell" },
                    { value: "unhelpful", label: "Not useful to me" },
                    { value: "unknown", label: "Prefer not to say" },
                  ]}
                />
                <Select
                  label="Next approach"
                  value={choice}
                  onChange={setChoice}
                  error={errors.choice}
                  options={[
                    { value: "", label: "Choose, or leave for now" },
                    { value: "continue", label: "Continue this plan" },
                    { value: "shrink", label: "Try a smaller part" },
                    {
                      value: "switch",
                      label: "Switch to a different activity",
                    },
                    {
                      value: "support",
                      label: "Pause and look at human support",
                    },
                  ]}
                />
                {choice === "shrink" && (
                  <Field
                    label="Your adjusted step"
                    value={adjustment}
                    onChange={setAdjustment}
                    maxLength={240}
                    error={errors.adjustment}
                    hint="Edit a smaller part of this activity in your own words. A different activity is a switch."
                  />
                )}
                <p className="hint">
                  Switching or looking at support pauses the old plan and its
                  linked reminder preview. Continuing a stopped plan resumes the
                  plan; its preview stays paused until you choose otherwise.
                </p>
                <div className="actions">
                  <button>Apply this review</button>
                  <ActionLink href="/today" secondary>
                    Keep draft & leave
                  </ActionLink>
                  <button
                    type="button"
                    className="text"
                    onClick={() => {
                      dispatch({ type: "clearDraft", prefix: "weekly.draft." });
                      setErrors({});
                    }}
                  >
                    Discard review draft
                  </button>
                </div>
              </>
            )}
          </form>
          <aside aria-label="Plan and reported experience">
            {target && (
              <section className="panel">
                <p className="eyebrow">
                  Current plan · Version {target.version}
                </p>
                <h2>{target.title}</h2>
                <p className="meta">
                  {target.paused
                    ? "Paused"
                    : report
                      ? "You reported: " + report.outcome
                      : "Outcome unknown"}
                </p>
                {report?.experience && <p>{report.experience}</p>}
                <p>
                  These are your reports, not a measure of efficacy or a
                  clinical assessment.
                </p>
                <ActionLink href={"/steps/" + target.id} secondary>
                  Open reviewed step
                </ActionLink>
              </section>
            )}
            {result && <Notice id="weekly-feedback">{result}</Notice>}
          </aside>
        </div>
      )}
    </>
  );
}
