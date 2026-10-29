"use client";
import { useState, useTransition } from "react";
import { ConfirmDelete } from "@/components/ui";
import type { Pattern } from "@/domain/journey";
import type { RiskLevel } from "@/domain/safety";
import type { Energy } from "@/domain/steps";
import { localDay, readableDay } from "@/domain/time";
import {
  dismissPattern,
  editNote,
  keepPattern,
  removeNote,
  writeNote,
} from "@/server/actions/reflect";
import type { NoteView } from "@/server/data/notes";
import { SafetyCheck } from "../safety/safety-check";
import styles from "./journey.module.css";

export function NoteComposer({ region }: { region: string | null }) {
  const [text, setText] = useState("");
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await writeNote({ text, energy });
          if (!r.ok) return setError(r.error ?? "");
          setError("");
          setText("");
          setEnergy(null);
          setSaved(true);
          setSafety(r.safety ?? "none");
        });
      }}
    >
      <div className="field">
        <label htmlFor="note">Write a note</label>
        <p className="hint" id="note-hint">
          A few words is enough. Only you can see it.
        </p>
        <textarea
          id="note"
          rows={3}
          maxLength={3000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          aria-describedby={error ? "note-error" : "note-hint"}
          aria-invalid={!!error}
        />
        {error && (
          <p id="note-error" className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <fieldset className="chips">
        <legend>
          Energy <span className="meta">Optional</span>
        </legend>
        {(["low", "okay", "more"] as const).map((e) => (
          <button
            key={e}
            type="button"
            className="chip small"
            aria-pressed={energy === e}
            onClick={() => setEnergy((v) => (v === e ? null : e))}
          >
            {e === "low" ? "Low" : e === "okay" ? "Okay" : "More than usual"}
          </button>
        ))}
      </fieldset>
      <div className="actions">
        <button disabled={pending}>Save note</button>
        {saved && (
          <p className="meta" role="status">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function NoteItem({
  id,
  text,
  region,
}: {
  id: string;
  text: string;
  region: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [prevText, setPrevText] = useState(text);
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();

  if (text !== prevText) {
    setPrevText(text);
    setValue(text);
  }

  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await editNote(id, value);
            if (!r.ok) return setError(r.error ?? "");
            setEditing(false);
            setSafety(r.safety ?? "none");
          });
        }}
      >
        <label htmlFor={"edit-" + id} className="sr-only">
          Edit note
        </label>
        <textarea
          id={"edit-" + id}
          rows={3}
          maxLength={3000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="inline-edit"
          aria-invalid={!!error}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button disabled={pending}>Save</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setValue(text);
              setError("");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <>
      <p className="note-text">{text}</p>
      <div className="row-actions">
        <button
          type="button"
          className="text"
          onClick={() => {
            setValue(text);
            setError("");
            setEditing(true);
          }}
        >
          Edit
        </button>
        <ConfirmDelete
          label="Delete note"
          question="Delete this note?"
          onConfirm={() => startTransition(() => removeNote(id))}
        />
      </div>
      {safety !== "none" && (
        <SafetyCheck region={region} onResume={() => setSafety("none")} />
      )}
    </>
  );
}

export function SavedNotesList({
  notes,
  region,
  timezone,
  today,
}: {
  notes: NoteView[];
  region: string | null;
  timezone: string;
  today: string;
}) {
  if (notes.length === 0) return null;
  return (
    <section aria-labelledby="saved-notes" className={styles.savedNotesSection}>
      <h2 id="saved-notes" className={styles.savedNotesHeading}>
        Saved notes
      </h2>
      <ul className={`plain-list ${styles.notesList}`}>
        {notes.map((n) => {
          const day = localDay(timezone, new Date(n.createdAt));
          const dayLabel = readableDay(day, today);
          const energyText = n.energy
            ? ` · Energy: ${
                n.energy === "low"
                  ? "Low"
                  : n.energy === "okay"
                    ? "Okay"
                    : "More than usual"
              }`
            : "";
          return (
            <li
              key={n.id}
              className={`panel ${styles.noteCard}`}
              data-note-id={n.id}
            >
              <p className="meta">
                {dayLabel}
                {energyText}
              </p>
              <NoteItem id={n.id} text={n.text} region={region} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PatternCard({
  pattern,
  memoryOn,
}: {
  pattern: Pattern;
  memoryOn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <p>{pattern.text}</p>
      <div className="row-actions">
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => startTransition(() => keepPattern(pattern.key))}
        >
          {memoryOn ? "That fits, remember it" : "That fits"}
        </button>
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={() => startTransition(() => dismissPattern(pattern.key))}
        >
          Doesn&apos;t fit
        </button>
      </div>
    </li>
  );
}
