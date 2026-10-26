"use client";
import Link from "next/link";
import {
  useId,
  useRef,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
/** After a failed submit, focus the first invalid field within the form (or element) that failed, never another form's stale error. */
export function focusFirstInvalid(source: FormEvent | Element | null) {
  const scope =
    source && "currentTarget" in source
      ? (source.currentTarget as Element | null)
      : source;
  requestAnimationFrame(() =>
    scope?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}

export function PageHeading({
  eyebrow,
  children,
  description,
}: {
  eyebrow?: string;
  children: ReactNode;
  description?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [children]);
  return (
    <header className="page-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 ref={heading} tabIndex={-1}>
        {children}
      </h1>
      {description && <p className="lede">{description}</p>}
    </header>
  );
}
export function Notice({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} tabIndex={-1} className="notice" role="status">
      {children}
    </p>
  );
}
export function Field({
  label,
  value,
  onChange,
  error,
  multiline = false,
  maxLength = 3000,
  hint,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
}) {
  const id = useId();
  const props = {
    id,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    maxLength,
    "aria-invalid": !!error,
    "aria-describedby": error ? id + "-error" : hint ? id + "-hint" : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={id + "-hint"} className="hint">
          {hint}
        </p>
      )}
      {multiline ? <textarea {...props} rows={4} /> : <input {...props} />}{" "}
      {error && (
        <p id={id + "-error"} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="error" id={id + "-error"} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={secondary ? "button secondary" : "button"} href={href}>
      {children}
    </Link>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Two-step delete for the user's own words: asks first, and "Keep it" returns focus to the opener. `extra` adds an opt-in, unchecked by default. */
export function ConfirmDelete({
  label,
  question,
  detail,
  extra,
  onConfirm,
}: {
  label: string;
  question: string;
  detail?: ReactNode;
  extra?: string;
  onConfirm: (extraChecked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [extraChecked, setExtraChecked] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const prompt = useRef<HTMLParagraphElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) prompt.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!open)
    return (
      <button
        ref={opener}
        type="button"
        className="text danger"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  return (
    <div className="panel" role="group" aria-label={question}>
      <p ref={prompt} tabIndex={-1}>
        <strong>{question}</strong>
        {detail ? <> {detail}</> : null}
      </p>
      {extra ? (
        <Toggle
          label={extra}
          checked={extraChecked}
          onChange={setExtraChecked}
        />
      ) : null}
      <div className="actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm(extraChecked);
            setExtraChecked(false);
            setOpen(false);
          }}
        >
          {"Yes, " + label.toLowerCase()}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setExtraChecked(false);
            setOpen(false);
          }}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
