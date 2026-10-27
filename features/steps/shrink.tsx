"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { smallerVersions } from "@/server/actions/steps";

/**
 * Offers smaller versions of a step (from the AI, or the activity library
 * when the AI is off) and lets the person pick one or write their own.
 */
export function Shrink({
  stepId,
  title,
  onPick,
  onCancel,
  pickLabel = "Use this version",
  error,
}: {
  stepId?: string;
  title: string;
  onPick: (smaller: string) => void;
  onCancel: () => void;
  pickLabel?: string;
  error?: string;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [value, setValue] = useState("");
  const [loading, startLoading] = useTransition();
  const id = useId();
  useEffect(() => {
    startLoading(async () => {
      const result = await smallerVersions(stepId ? { stepId } : { title });
      setOptions(result.options);
      setValue((v) => v || result.options[0] || "");
    });
  }, [stepId, title]);
  return (
    <div className="panel shrink" role="group" aria-label="Make it smaller">
      <p className="eyebrow">Make it smaller</p>
      <p className="hint">
        Same activity, less of it: shorter, fewer things, or just the first
        part. Small enough that starting feels easy.
      </p>
      {loading && <p className="meta">Finding smaller versions…</p>}
      {options && options.length > 0 && (
        <fieldset className="chips">
          <legend className="sr-only">Smaller versions</legend>
          {options.map((o) => (
            <label key={o} className="chip">
              <input
                type="radio"
                name={id}
                checked={value === o}
                onChange={() => setValue(o)}
              />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor={id + "-own"}>
          {options?.length ? "Or edit it" : "Smaller version"}
        </label>
        <input
          id={id + "-own"}
          value={value}
          maxLength={160}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          placeholder={title}
        />
        {error && (
          <p id={id + "-error"} className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="actions">
        <button type="button" onClick={() => onPick(value.trim())}>
          {pickLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Keep it as it is
        </button>
      </div>
    </div>
  );
}
