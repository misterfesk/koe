"use client";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { FieldErrors } from "@/domain/forms";
import type { RiskLevel } from "@/domain/safety";
import {
  areaLabels,
  expectationLabels,
  type Area,
  type Expectation,
} from "@/domain/steps";
import { weekdayOptions } from "@/domain/time";
import { chooseStep } from "@/server/actions/steps";
import { SafetyCheck } from "../safety/safety-check";

const cueExamples = [
  "After breakfast",
  "After lunch",
  "When I get home",
  "After dinner",
  "Before bed",
];

export type PlanDraft = {
  area: Area;
  title: string;
  cue?: string;
  problem?: string;
  sourceMemoryId?: string;
  sourceConversationId?: string;
};

/**
 * Turns a step into an if-then plan: what, when ("After lunch, I'll…"),
 * which day, and an optional guess at how much it will help, to compare
 * with how it actually went.
 */
export function PlanForm({
  initial,
  region,
  editTitle = true,
  chooseArea = false,
  onDone,
  onCancel,
}: {
  initial: PlanDraft;
  region: string | null;
  editTitle?: boolean;
  chooseArea?: boolean;
  /** Where to go after choosing; defaults to staying put (Today refreshes). */
  onDone?: (id: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const [area, setArea] = useState<Area>(initial.area);
  const [title, setTitle] = useState(initial.title);
  const [cue, setCue] = useState(initial.cue ?? "");
  const [when, setWhen] = useState<"today" | "tomorrow" | "repeat">("today");
  const [days, setDays] = useState<number[]>([]);
  const [expectation, setExpectation] = useState<Expectation | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [safety, setSafety] = useState<{ level: RiskLevel; id: string }>();
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await chooseStep({
        area,
        title,
        cue,
        expectation,
        problem: initial.problem,
        when,
        repeatDays: when === "repeat" ? days : undefined,
        sourceMemoryId: initial.sourceMemoryId,
        sourceConversationId: initial.sourceConversationId,
      });
      if (!r.ok) {
        setErrors(r.errors);
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>(
              `[data-plan="${id}"] [aria-invalid="true"]`,
            )
            ?.focus(),
        );
        return;
      }
      if (r.safety && r.safety !== "none")
        return setSafety({ level: r.safety, id: r.id });
      if (onDone) onDone(r.id);
      else router.refresh();
    });
  }

  if (safety)
    return (
      <SafetyCheck
        region={region}
        onResume={() => (onDone ? onDone(safety.id) : router.refresh())}
      />
    );

  return (
    <form onSubmit={submit} noValidate data-plan={id} className="plan-form">
      {chooseArea && (
        <fieldset className="chips">
          <legend>What kind of step?</legend>
          {(Object.keys(areaLabels) as Area[]).map((a) => (
            <button
              key={a}
              type="button"
              className="chip"
              aria-pressed={area === a}
              onClick={() => setArea(a)}
            >
              {areaLabels[a]}
            </button>
          ))}
        </fieldset>
      )}
      {editTitle ? (
        <div className="field">
          <label htmlFor={id + "-title"}>Your step</label>
          <p className="hint" id={id + "-title-hint"}>
            Small and specific works best, like &ldquo;Walk to the corner and
            back&rdquo;.
          </p>
          <input
            id={id + "-title"}
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={
              errors.title ? id + "-title-error" : id + "-title-hint"
            }
          />
          {errors.title && (
            <p id={id + "-title-error"} className="error" role="alert">
              {errors.title}
            </p>
          )}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor={id + "-cue"}>When will you do it?</label>
        <p className="hint" id={id + "-cue-hint"}>
          Tie it to something you already do. &ldquo;After lunch,
          I&apos;ll…&rdquo; makes it more likely to happen.
        </p>
        <input
          id={id + "-cue"}
          value={cue}
          maxLength={120}
          onChange={(e) => setCue(e.target.value)}
          aria-describedby={id + "-cue-hint"}
          aria-invalid={!!errors.cue}
          placeholder="After lunch"
        />
        <div className="chips" aria-label="Examples">
          {cueExamples.map((c) => (
            <button
              key={c}
              type="button"
              className="chip small"
              aria-pressed={cue === c}
              onClick={() => setCue(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {errors.cue && (
          <p className="error" role="alert">
            {errors.cue}
          </p>
        )}
      </div>

      <fieldset className="chips">
        <legend>Which day?</legend>
        {(
          [
            ["today", "Today"],
            ["tomorrow", "Tomorrow"],
            ["repeat", "Repeat on days…"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={when === value}
            onClick={() => setWhen(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {when === "repeat" && (
        <fieldset className="chips">
          <legend className="sr-only">Repeat on</legend>
          {weekdayOptions.map((d) => (
            <label key={d.value} className="chip small">
              <input
                type="checkbox"
                checked={days.includes(d.value)}
                onChange={(e) =>
                  setDays((list) =>
                    e.target.checked
                      ? [...list, d.value]
                      : list.filter((x) => x !== d.value),
                  )
                }
                aria-invalid={!!errors.repeatDays}
              />
              <span>{d.label}</span>
            </label>
          ))}
          {errors.repeatDays && (
            <p className="error" role="alert">
              {errors.repeatDays}
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="chips">
        <legend>
          How much do you expect it to help?{" "}
          <span className="meta">Optional</span>
        </legend>
        {(Object.keys(expectationLabels) as Expectation[]).map((x) => (
          <button
            key={x}
            type="button"
            className="chip"
            aria-pressed={expectation === x}
            onClick={() => setExpectation((v) => (v === x ? null : x))}
          >
            {expectationLabels[x]}
          </button>
        ))}
        <p className="meta">
          Low mood often predicts things will go worse than they do. Later you
          can compare.
        </p>
      </fieldset>

      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Choose this step"}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Back
          </button>
        )}
      </div>
    </form>
  );
}
