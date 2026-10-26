"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Select,
  ActionLink,
  focusFirstInvalid,
  ConfirmDelete,
} from "@/components/ui";
import { stepInput, canRetrieveMemory } from "@/domain/state";
export function Planner() {
  const { state, dispatch } = useSession();
  const [title, setTitle] = useDraft("step.title");
  const [area, setArea] = useDraft("step.area", "Enjoyment");
  const [prediction, setPrediction] = useDraft("step.prediction");
  const [sourceId, setSourceId] = useDraft("step.sourceMemoryId");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const submitted = useRef(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sourceId && !canRetrieveMemory(state, sourceId)) {
      setErrors({
        title:
          "The memory card behind this step was deleted or paused. Rewrite the step in your own words, or discard the draft.",
      });
      focusFirstInvalid(e);
      return;
    }
    const result = stepInput.safeParse({ title, area, prediction });
    if (!result.success) {
      const fields: Record<string, string> = {};
      result.error.issues.forEach(
        (i) => (fields[String(i.path[0])] = i.message),
      );
      setErrors(fields);
      focusFirstInvalid(e);
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    const id = "step-" + (state.sequence + 1);
    dispatch({
      type: "choose",
      ...result.data,
      sourceMemoryId: sourceId || undefined,
    });
    dispatch({ type: "clearDraft", prefix: "step." });
    router.push("/steps/" + id);
  }
  return (
    <>
      <PageHeading
        eyebrow="Steps · new step"
        description="Something ordinary and safe that fits today. Rest and asking for help count."
      >
        Write a step
      </PageHeading>
      <form onSubmit={submit} noValidate className="prose">
        <Select
          label="Area"
          value={area}
          onChange={setArea}
          options={[
            "Enjoyment",
            "Rest",
            "Connection",
            "Everyday care",
            "Care access",
          ].map((x) => ({ value: x, label: x }))}
        />
        <Field
          label="Your step"
          value={title}
          onChange={(value) => {
            setTitle(value);
            setSourceId("");
          }}
          maxLength={240}
          error={errors.title}
          hint="Small and specific works best, like “Read one page”."
        />
        <details>
          <summary>Make it smaller</summary>
          <p className="hint">
            Keep the same activity. Try less time, fewer items or an easier
            setting, then edit your step above.
          </p>
        </details>
        <div className="divider" />
        <Field
          label="What do you expect will happen? (optional)"
          value={prediction}
          onChange={setPrediction}
          maxLength={500}
          multiline
          error={errors.prediction}
          hint="For example: “One page will feel like too much.” After you try it, you can compare. This is an everyday step, not an exposure exercise."
        />
        <div className="actions">
          <button type="submit">Choose this step</button>
          <ActionLink href="/today" secondary>
            Keep draft & leave
          </ActionLink>
          <ConfirmDelete
            label="Discard draft"
            question="Discard this step draft?"
            detail="Your chosen steps stay."
            onConfirm={() => {
              dispatch({ type: "clearDraft", prefix: "step." });
              setErrors({});
            }}
          />
        </div>
      </form>
    </>
  );
}
