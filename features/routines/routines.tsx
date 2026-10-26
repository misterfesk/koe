"use client";

import { CoachingPaused } from "@/components/coaching-paused";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { stepInput, type Step } from "@/domain/state";

const routineIdeas = {
  rest: {
    label: "Rest",
    title: "Pause somewhere comfortable for one minute",
    area: "Rest",
  },
  movement: {
    label: "Comfortable movement",
    title: "Move in a way that feels comfortable for me",
    area: "Everyday care",
  },
  winddown: {
    label: "Wind-down",
    title: "Put one optional evening task aside",
    area: "Rest",
  },
};

function RoutineEditor({ step }: { step: Step }) {
  const { dispatch } = useSession();
  const [title, setTitle] = useDraft("routine.edit." + step.id, step.title);
  const [error, setError] = useState("");
  function update(e: FormEvent) {
    e.preventDefault();
    const parsed = stepInput.safeParse({
      title,
      area: step.area,
      prediction: "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      focusFirstInvalid(e);
      return;
    }
    setError("");
    dispatch({ type: "propose", id: step.id, title: parsed.data.title });
    dispatch({ type: "acceptAdjustment", id: step.id });
    dispatch({ type: "clearDraft", prefix: "routine.edit." + step.id });
    dispatch({
      type: "draft",
      key: "routine.feedback",
      value: "Routine updated. Earlier versions stay in its history.",
    });
  }
  return (
    <li aria-label={"Routine: " + step.title}>
      <p className="eyebrow">
        {step.area} · Version {step.version}
      </p>
      <h3>{step.title}</h3>
      <p className="meta">
        {step.paused ? "Paused" : "Repeats when you want it to"}
      </p>
      <form onSubmit={update} noValidate>
        <Field
          label="Change the routine"
          value={title}
          onChange={setTitle}
          error={error}
          maxLength={240}
        />
        <button className="secondary">Update routine</button>
      </form>
      <div className="actions">
        <button
          className="secondary"
          onClick={() => {
            dispatch({ type: "pauseStep", id: step.id });
            dispatch({
              type: "draft",
              key: "routine.feedback",
              value: step.paused
                ? "Routine resumed. Its reminder preview stays paused until you resume it."
                : "Routine paused. Its reminder preview is paused too.",
            });
          }}
        >
          {step.paused ? "Resume routine" : "Pause routine"}
        </button>
        <ActionLink href={"/steps/" + step.id} secondary>
          Open history
        </ActionLink>
        <button
          className="text danger"
          onClick={() => {
            dispatch({ type: "deleteStep", id: step.id });
            dispatch({
              type: "draft",
              key: "routine.feedback",
              value: "Routine deleted. Its reminder preview is cancelled.",
            });
            requestAnimationFrame(() =>
              document.getElementById("routine-feedback")?.focus(),
            );
          }}
        >
          Delete routine
        </button>
      </div>
    </li>
  );
}

export function Routines() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [kind, setKind] = useDraft("routine.new.kind", "rest");
  const idea =
    routineIdeas[kind as keyof typeof routineIdeas] ?? routineIdeas.rest;
  const [title, setTitle] = useDraft("routine.new.title", idea.title);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const routines = state.steps.filter((step) => step.routine);

  function choose(e: FormEvent) {
    e.preventDefault();
    const parsed = stepInput.safeParse({
      title,
      area: idea.area,
      prediction: "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      focusFirstInvalid(e);
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    const id = "step-" + (state.sequence + 1);
    dispatch({ type: "choose", ...parsed.data, routine: true });
    dispatch({ type: "clearDraft", prefix: "routine.new." });
    router.push("/steps/" + id);
  }

  if (state.scenario === "coaching paused")
    return <CoachingPaused eyebrow="Routines · review scenario" />;
  return (
    <>
      <PageHeading
        eyebrow="Steps"
        description="A step that repeats, like resting or winding down. Change or pause it any time."
      >
        Routines
      </PageHeading>
      <div className="split">
        <section>
          <h2>Start a routine</h2>
          <p>
            Pick something comfortable that fits any guidance you already
            follow. Koe sets no sleep, exercise or weight targets.
          </p>
          <form onSubmit={choose} noValidate>
            <Select
              label="Kind"
              value={kind}
              onChange={(value) => {
                setKind(value);
                setTitle(
                  (
                    routineIdeas[value as keyof typeof routineIdeas] ??
                    routineIdeas.rest
                  ).title,
                );
              }}
              options={Object.entries(routineIdeas).map(([value, entry]) => ({
                value,
                label: entry.label,
              }))}
            />
            <Field
              label="Your routine"
              value={title}
              onChange={setTitle}
              maxLength={240}
              error={error}
              hint="Edit it to fit your day."
            />
            <div className="actions">
              <button>Choose this routine</button>
              <ActionLink href="/steps" secondary>
                Keep draft & leave
              </ActionLink>
            </div>
          </form>
        </section>
        <aside>
          <h2>Your routines</h2>
          {routines.length === 0 ? (
            <Empty>No routines yet. You don&apos;t need one.</Empty>
          ) : (
            <ul className="rows">
              {routines.map((step) => (
                <RoutineEditor key={step.id} step={step} />
              ))}
            </ul>
          )}
        </aside>
      </div>
      {state.drafts["routine.feedback"] && (
        <Notice id="routine-feedback">
          {state.drafts["routine.feedback"]}
        </Notice>
      )}
      <div className="actions">
        <ActionLink href="/steps" secondary>
          Back to Steps
        </ActionLink>
      </div>
    </>
  );
}
