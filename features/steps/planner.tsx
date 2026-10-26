"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, useDraft } from "@/components/session";
import { PageHeading, Field, Select, ActionLink } from "@/components/ui";
import { stepInput, makeSmaller } from "@/domain/state";
export function Planner() {
  const { state, dispatch } = useSession();
  const [title, setTitle] = useDraft("step.title");
  const [area, setArea] = useDraft("step.area", "Enjoyment");
  const [prediction, setPrediction] = useDraft("step.prediction");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const submitted = useRef(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = stepInput.safeParse({ title, area, prediction });
    if (!result.success) {
      const fields: Record<string, string> = {};
      result.error.issues.forEach(
        (i) => (fields[String(i.path[0])] = i.message),
      );
      setErrors(fields);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    const id = "step-" + (state.sequence + 1);
    dispatch({ type: "choose", ...result.data });
    dispatch({ type: "clearDraft", prefix: "step." });
    router.push("/steps/" + id);
  }
  return (
    <>
      <PageHeading
        eyebrow="Steps · make it yours"
        description="Choose an ordinary, safe action that fits your day. Rest and asking for help are valid choices."
      >
        What would matter a little?
      </PageHeading>
      <form onSubmit={submit} noValidate className="prose">
        <Select
          label="Meaningful area"
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
          onChange={setTitle}
          maxLength={240}
          error={errors.title}
          hint="Fictional examples only. Keep it specific and adjustable."
        />
        <button
          type="button"
          className="secondary"
          onClick={() => setTitle(makeSmaller(title || "an activity I choose"))}
        >
          Make this smaller, then edit
        </button>
        <div className="divider" />
        <Field
          label="Prediction (optional)"
          value={prediction}
          onChange={setPrediction}
          maxLength={500}
          multiline
          error={errors.prediction}
          hint="For example: I expect one page will feel like too much. This is an ordinary-action preview, not an exposure exercise."
        />
        <div className="actions">
          <button type="submit">Choose this step</button>
          <ActionLink href="/today" secondary>
            Keep draft & leave
          </ActionLink>
          <button
            type="button"
            className="text"
            onClick={() => {
              dispatch({ type: "clearDraft", prefix: "step." });
              setErrors({});
            }}
          >
            Discard draft
          </button>
        </div>
      </form>
    </>
  );
}
