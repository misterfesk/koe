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
  ConfirmDelete,
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
    "weekly.draft.adjustment." + targetId,
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
              ? "Choose what happens next, or leave without changing the step."
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
        eyebrow="Reflect · weekly review"
        description={
          tone(state.appearance.tone, "review", state.energy).message
        }
      >
        Look back on a step
      </PageHeading>
      <p className="prose">
        Say what it gave you, if anything, then choose what happens next. Only
        the last question needs an answer.
      </p>
      {state.steps.length === 0 ? (
        <>
          <Empty>No steps to look back on yet. Nothing to catch up on.</Empty>
          <div className="actions">
            <ActionLink href="/today">See today&apos;s suggestion</ActionLink>
            <ActionLink href="/steps/new" secondary>
              Write my own step
            </ActionLink>
          </div>
        </>
      ) : (
        <div className="split">
          <form onSubmit={submit} noValidate>
            <Select
              label="Step"
              value={targetId}
              onChange={setTargetId}
              options={[
                { value: "", label: "Choose a step" },
                ...state.steps.map((step) => ({
                  value: step.id,
                  label: step.title + (step.paused ? " (paused)" : ""),
                })),
              ]}
            />
            {!target ? (
              <Empty>
                That step no longer exists. Choose another, or leave the review.
              </Empty>
            ) : (
              <>
                <Field
                  label="What did it give you?"
                  value={functionNote}
                  onChange={setFunctionNote}
                  multiline
                  maxLength={500}
                  error={errors.functionNote}
                />
                <Select
                  label="How much effort did it take?"
                  value={effort}
                  onChange={setEffort}
                  error={errors.effort}
                  options={[
                    { value: "", label: "Skip" },
                    { value: "less", label: "Less than I expected" },
                    { value: "manageable", label: "Manageable for me" },
                    { value: "more", label: "More than I wanted" },
                    { value: "unknown", label: "Prefer not to say" },
                  ]}
                />
                <Select
                  label="Was it useful?"
                  value={helpfulness}
                  onChange={setHelpfulness}
                  error={errors.helpfulness}
                  options={[
                    { value: "", label: "Skip" },
                    { value: "helpful", label: "Useful to me" },
                    { value: "mixed", label: "Mixed / hard to tell" },
                    { value: "unhelpful", label: "Not useful to me" },
                    { value: "unknown", label: "Prefer not to say" },
                  ]}
                />
                <Select
                  label="What next?"
                  value={choice}
                  onChange={setChoice}
                  error={errors.choice}
                  options={[
                    { value: "", label: "Choose one" },
                    { value: "continue", label: "Keep this step" },
                    { value: "shrink", label: "Try a smaller version" },
                    {
                      value: "switch",
                      label: "Try a different step",
                    },
                    {
                      value: "support",
                      label: "Pause it and look at support from people",
                    },
                  ]}
                />
                {choice === "shrink" && (
                  <Field
                    label="Smaller version"
                    value={adjustment}
                    onChange={setAdjustment}
                    maxLength={240}
                    error={errors.adjustment}
                    hint="The same step, cut down. For something else, choose “Try a different step”."
                  />
                )}
                {(choice === "switch" || choice === "support") && (
                  <p className="hint">
                    This pauses the step and its reminder preview.
                  </p>
                )}
                {choice === "continue" && target.paused && (
                  <p className="hint">
                    This resumes the step. Its reminder preview stays paused
                    until you resume it.
                  </p>
                )}
                <div className="actions">
                  <button>
                    {choice === "continue"
                      ? "Keep it on Today"
                      : choice === "shrink"
                        ? "Save the smaller version"
                        : choice === "switch"
                          ? "Pause it and write a new step"
                          : choice === "support"
                            ? "Pause it and open Help & support"
                            : "Save review"}
                  </button>
                  <ActionLink href="/today" secondary>
                    Keep draft & leave
                  </ActionLink>
                  <ConfirmDelete
                    label="Discard review draft"
                    question="Discard this weekly review draft?"
                    detail="This deletes your unsaved review and smaller-version drafts. Saved steps and reports stay."
                    onConfirm={() => {
                      dispatch({ type: "clearDraft", prefix: "weekly.draft." });
                      setErrors({});
                    }}
                  />
                </div>
              </>
            )}
          </form>
          <aside aria-label="The step and how it went">
            {target && (
              <section className="panel">
                <p className="eyebrow">{target.area}</p>
                <h2>{target.title}</h2>
                <p className="meta">
                  {target.paused
                    ? "Paused"
                    : report
                      ? "You said: " + report.outcome
                      : "Not reported yet"}
                </p>
                {report?.experience && <p>{report.experience}</p>}
                <p className="hint">
                  Your own report, not a measure of whether it works.
                </p>
                <ActionLink href={"/steps/" + target.id} secondary>
                  Open step
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
