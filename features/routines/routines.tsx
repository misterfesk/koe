"use client";

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
import { tone } from "@/domain/tone";

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
      value:
        "Routine updated. Earlier versions and reports stay in its step history.",
    });
  }
  return (
    <li aria-label={"Routine: " + step.title}>
      <p className="eyebrow">
        {step.area} · Version {step.version}
      </p>
      <h3>{step.title}</h3>
      <p className="meta">
        {step.paused ? "Stopped for now" : "Optional routine · no obligation"}
      </p>
      <form onSubmit={update} noValidate>
        <Field
          label="Adjusted routine"
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
                ? "Routine resumed. Any linked reminder preview stays paused until you choose otherwise."
                : "Routine stopped for now. Any linked reminder preview is paused.",
            });
          }}
        >
          {step.paused ? "Resume routine" : "Stop routine"}
        </button>
        <ActionLink href={"/steps/" + step.id} secondary>
          Open routine history
        </ActionLink>
        <button
          className="text danger"
          onClick={() => {
            dispatch({ type: "deleteStep", id: step.id });
            dispatch({
              type: "draft",
              key: "routine.feedback",
              value:
                "Routine removed from this session. Any linked reminder preview is canceled.",
            });
            requestAnimationFrame(() =>
              document.getElementById("routine-feedback")?.focus(),
            );
          }}
        >
          Remove routine
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

  return (
    <>
      <PageHeading
        eyebrow="Steps · flexible routines"
        description={
          tone(state.appearance.tone, "welcome", state.energy).message
        }
      >
        A rhythm you can change.
      </PageHeading>
      <div className="split">
        <section>
          <h2>One optional rhythm.</h2>
          <p>
            Choose something comfortable and consistent with any guidance you
            already follow. There are no sleep, exercise or weight targets.
          </p>
          <form onSubmit={choose} noValidate>
            <Select
              label="Routine type"
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
              hint="Edit the idea to fit your fictional day. Choosing does not mean completing."
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
          <h2>Your rhythms, adjustable.</h2>
          <p className="hint">
            Stopping pauses the routine and any linked reminder preview.
            Resuming the routine leaves that preview paused until you choose to
            resume it.
          </p>
          {routines.length === 0 ? (
            <Empty>No routines chosen. You do not need one.</Empty>
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
        <ActionLink href="/settings/reminders" secondary>
          Reminder preview
        </ActionLink>
        <ActionLink href="/reflect/review" secondary>
          Optional weekly review
        </ActionLink>
      </div>
    </>
  );
}
