"use client";

import { useRef, useState, type FormEvent } from "react";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
  Empty,
  Field,
  Notice,
  PageHeading,
  Select,
  focusFirstInvalid,
  ConfirmDelete,
} from "@/components/ui";
import { journalActions, journalText } from "@/domain/reflection";
import type { Journal } from "@/domain/state";
import { tone, type Energy } from "@/domain/tone";
import { MemoryApproval } from "@/features/memory/approval";
import { downloadJson } from "@/services/export";
import styles from "./journal.module.css";

const energyLabels: Record<Energy, string> = {
  unknown: "Not specified",
  low: "Low",
  steady: "Steady",
  more: "More room",
};
const energyOptions = (Object.entries(energyLabels) as [Energy, string][]).map(
  ([value, label]) => ({ value, label }),
);

function JournalEntry({ note }: { note: Journal }) {
  const { dispatch } = useSession();
  const prefix = "journal.entry." + note.id + ".";
  const [editing, setEditing] = useDraft(prefix + "editing");
  const [text, setText] = useDraft(prefix + "text", note.text);
  const [error, setError] = useState("");

  function save(event: FormEvent) {
    event.preventDefault();
    const result = journalText.safeParse(text);
    if (!result.success) {
      setError(result.error.issues[0].message);
      focusFirstInvalid(event);
      return;
    }
    dispatch({ type: "journalEdit", id: note.id, text: result.data });
    dispatch({ type: "clearDraft", prefix });
    setError("");
    requestAnimationFrame(() =>
      document.getElementById("note-" + note.id)?.focus(),
    );
  }

  return (
    <li className={styles.entry}>
      <div className={styles.date}>
        <p className="eyebrow">{note.at.slice(0, 10)}</p>
        <p className="meta">Reported energy: {energyLabels[note.energy]}</p>
      </div>
      <div className={styles.body}>
        {editing === "yes" ? (
          <form id={"edit-" + note.id} onSubmit={save} noValidate>
            <Field
              label="Edit journal note"
              value={text}
              onChange={setText}
              multiline
              maxLength={3000}
              error={error}
            />
            <p className="hint">
              The original energy report is retained. This edits the note
              wording.
            </p>
            <div className="actions">
              <button>Save note changes</button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  dispatch({ type: "clearDraft", prefix });
                  setError("");
                }}
              >
                Discard edit
              </button>
            </div>
          </form>
        ) : (
          <p id={"note-" + note.id} tabIndex={-1} className={styles.text}>
            {note.text || "No written note. Energy report only."}
          </p>
        )}
        <div className="actions">
          {editing !== "yes" && (
            <button
              className="secondary"
              onClick={() => {
                setEditing("yes");
                requestAnimationFrame(() =>
                  document
                    .getElementById("edit-" + note.id)
                    ?.querySelector("textarea")
                    ?.focus(),
                );
              }}
            >
              Edit note
            </button>
          )}
          <ConfirmDelete
            label="Delete note"
            question="Delete this note?"
            detail="This cannot be undone."
            onConfirm={() => {
              dispatch({ type: "journalDelete", id: note.id });
              dispatch({ type: "clearDraft", prefix });
              dispatch({
                type: "clearDraft",
                prefix: "journal.memory." + note.id + ".",
              });
              requestAnimationFrame(() =>
                document.getElementById("journal-timeline")?.focus(),
              );
            }}
          />
        </div>
        <MemoryApproval
          prefix={"journal.memory." + note.id}
          source={"Journal note " + note.id + ": explicit wording"}
        />
      </div>
    </li>
  );
}

export function JournalPage() {
  const { state, dispatch } = useSession();
  const [text, setText] = useDraft("journal.new.text");
  const [energy, setEnergy] = useDraft("journal.new.energy", state.energy);
  const [status, setStatus] = useDraft("journal.status");
  const [recordedAt, setRecordedAt] = useDraft("journal.recordedAt");
  const [error, setError] = useState("");
  const recording = useRef("");

  function record(event: FormEvent) {
    event.preventDefault();
    if (recordedAt === state.clock || recording.current === state.clock) return;
    const result = journalActions(text, energy as Energy);
    if (!result.ok) {
      if (!text.trim() && energy === "unknown") {
        setStatus(result.error);
        return;
      }
      setError(result.error);
      focusFirstInvalid(event);
      return;
    }
    recording.current = state.clock;
    for (const action of result.actions) dispatch(action);
    setRecordedAt(state.clock);
    setError("");
    setStatus(
      "Your reported energy and note are in this session timeline. Nothing was added to memory. Edit energy or wording to add a different note.",
    );
    requestAnimationFrame(() =>
      document.getElementById("journal-status")?.focus(),
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Reflect · energy & journal"
        description={
          tone(state.appearance.tone, "reflection", state.energy).message
        }
      >
        A note, if it helps.
      </PageHeading>
      <div className={styles.composer}>
        <form onSubmit={record} noValidate>
          <Select
            label="Energy for this note"
            value={energy}
            onChange={(value) => {
              setEnergy(value);
              setRecordedAt("");
              recording.current = "";
            }}
            options={energyOptions}
          />
          <Field
            label="Fictional journal note (optional)"
            value={text}
            onChange={(value) => {
              setText(value);
              setRecordedAt("");
              recording.current = "";
            }}
            multiline
            maxLength={3000}
            error={error}
            hint="Use fictional words. No mood, diagnosis or cause is inferred."
          />
          <div className="actions">
            <button disabled={recordedAt === state.clock}>
              Record energy / note
            </button>
            <ActionLink href="/reflect" secondary>
              Keep draft & leave
            </ActionLink>
            <button
              type="button"
              className="text"
              onClick={() => {
                dispatch({ type: "clearDraft", prefix: "journal.new." });
                setRecordedAt("");
                recording.current = "";
                setError("");
              }}
            >
              Discard note draft
            </button>
          </div>
        </form>
        {status && <Notice id="journal-status">{status}</Notice>}
      </div>
      <section className={styles.timeline} aria-labelledby="journal-timeline">
        <div className={styles.timelineHead}>
          <h2 id="journal-timeline" tabIndex={-1}>
            Your session timeline
          </h2>
          <button
            className="secondary"
            onClick={() =>
              downloadJson("koe-synthetic-journal.json", {
                kind: "synthetic-journal",
                notes: state.journal,
              })
            }
          >
            Export journal JSON
          </button>
        </div>
        {state.journal.length === 0 ? (
          <Empty>No notes yet. Nothing needs to be tracked.</Empty>
        ) : (
          <>
            <p className="meta">
              {state.journal.length === 1
                ? "One note is not a pattern. This timeline does not infer a cause."
                : "These are reported experiences, not inferred mood or causal trends."}
            </p>
            <ul className="rows">
              {[...state.journal].reverse().map((note) => (
                <JournalEntry note={note} key={note.id} />
              ))}
            </ul>
          </>
        )}
      </section>
      <div className="actions">
        <ActionLink href="/reflect/conversation" secondary>
          Scripted conversation
        </ActionLink>
        <ActionLink href="/settings/memory" secondary>
          Approved memory
        </ActionLink>
        <ActionLink href="/reflect/review" secondary>
          Weekly reflection
        </ActionLink>
      </div>
    </>
  );
}
