"use client";
import { useId, type ReactNode } from "react";

/**
 * A group of tappable choices. Real radio buttons or checkboxes inside chip
 * labels, so arrow keys, Space and screen readers work as they do natively.
 */
export function ChipGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple = false,
  max,
  exclusive,
}: {
  legend: ReactNode;
  hint?: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  max?: number;
  /** A choice that clears the others (and is cleared by them): "Nobody right now". */
  exclusive?: T;
}) {
  const name = useId();
  const hintId = useId();
  const full = multiple && max !== undefined && value.length >= max;
  const pick = (v: T, on: boolean) => {
    if (!multiple) return onChange(on ? [v] : []);
    if (!on) return onChange(value.filter((x) => x !== v));
    if (exclusive && v === exclusive) return onChange([v]);
    onChange([...value.filter((x) => x !== exclusive), v]);
  };
  return (
    <fieldset className="chips" aria-describedby={hint ? hintId : undefined}>
      <legend>{legend}</legend>
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {options.map((o) => {
        const checked = value.includes(o.value);
        return (
          <label key={o.value} className="chip">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.value}
              checked={checked}
              disabled={full && !checked}
              onChange={(e) => pick(o.value, e.target.checked)}
            />
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
