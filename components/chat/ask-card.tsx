"use client";

import { useId, useRef, useState } from "react";
import { chatAskSchema, plainTextAsk, type ChatAsk } from "@/domain/chat-turn";
import styles from "./chat.module.css";

export type AskCardProps = {
  ask: ChatAsk;
  /** The current question. The caller places navigation after this card. */
  label: string;
  /** Keep a fieldset name when the caller already shows a focused heading. */
  labelHidden?: boolean;
  value: string[];
  other: string;
  onChange: (value: string[]) => void;
  onOtherChange: (text: string) => void;
  /** Limits ordinary picks; inline text is separate and never changes them. */
  maxSelections?: number;
  /** Match the caller's server schema. Defaults to the intake's short answer cap. */
  maxLength?: number;
  disabled?: boolean;
};

/** Controlled answers. Remount with a question key when moving to another ask. */
export function AskCard({
  ask: input,
  label,
  labelHidden = false,
  value,
  other,
  onChange,
  onOtherChange,
  maxSelections,
  maxLength = 200,
  disabled = false,
}: AskCardProps) {
  const parsed = chatAskSchema.safeParse(input);
  const ask = parsed.success ? parsed.data : plainTextAsk;
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [otherOpen, setOtherOpen] = useState(Boolean(other));
  const options = ask.options ?? [];
  const limit = Math.max(
    0,
    Math.min(
      ask.kind === "single" ? 1 : options.length,
      maxSelections ?? options.length,
    ),
  );
  const picks = [...new Set(value)].filter((item) =>
    options.some((option) => option.id === item),
  );
  const stacked = ask.kind === "single" && options.length <= 5;

  function choose(optionId: string) {
    if (disabled) return;
    if (picks.includes(optionId))
      onChange(picks.filter((item) => item !== optionId));
    else if (ask.kind === "single" && limit > 0) onChange([optionId]);
    else if (picks.length < limit) onChange([...picks, optionId]);
  }

  return (
    <fieldset className={styles.ask} disabled={disabled}>
      <legend className={labelHidden ? styles.srOnly : styles.question}>
        {label}
      </legend>
      {ask.info && (
        <details className={styles.info}>
          <summary>
            <span aria-hidden="true">ⓘ</span> Why this question?
          </summary>
          <p>{ask.info}</p>
        </details>
      )}
      {ask.kind === "text" ? (
        <div className={styles.inlineField}>
          <label htmlFor={id}>Your answer</label>
          <textarea
            id={id}
            rows={3}
            value={other}
            onChange={(event) => onOtherChange(event.target.value)}
            placeholder={ask.placeholder || plainTextAsk.placeholder}
            maxLength={maxLength}
          />
        </div>
      ) : (
        <>
          <div
            className={stacked ? styles.stack : styles.pills}
            onKeyDown={(event) => {
              if (
                ![
                  "ArrowDown",
                  "ArrowUp",
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ].includes(event.key)
              )
                return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowDown" || event.key === "ArrowRight"
                          ? 1
                          : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }}
          >
            {options.map((option) => {
              const selected = picks.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={styles.option}
                  aria-pressed={selected}
                  disabled={
                    disabled ||
                    (!selected &&
                      (limit === 0 ||
                        (ask.kind === "multi" && picks.length >= limit)))
                  }
                  onClick={() => choose(option.id)}
                >
                  <span>{option.label}</span>
                  <span className={styles.check} aria-hidden="true">
                    {selected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {ask.allowOther && (
            <div className={styles.other}>
              <button
                type="button"
                className={styles.otherButton}
                aria-expanded={otherOpen || Boolean(other)}
                aria-controls={`${id}-other`}
                onClick={() => {
                  setOtherOpen(true);
                  requestAnimationFrame(() => field.current?.focus());
                }}
              >
                ✎ Something else…
              </button>
              {(otherOpen || Boolean(other)) && (
                <div id={`${id}-other`} className={styles.inlineField}>
                  <label htmlFor={id}>Your words</label>
                  <textarea
                    id={id}
                    ref={field}
                    rows={3}
                    value={other}
                    onChange={(event) => onOtherChange(event.target.value)}
                    placeholder={ask.placeholder || plainTextAsk.placeholder}
                    maxLength={maxLength}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
