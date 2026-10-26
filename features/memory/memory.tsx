"use client";

import { useState, type FormEvent } from "react";
import { useDraft, useSession } from "@/components/session";
import {
  Empty,
  Field,
  Notice,
  PageHeading,
  Toggle,
  focusFirstInvalid,
  ConfirmDelete,
} from "@/components/ui";
import { approveMemory, memoryText } from "@/domain/reflection";
import type { Memory } from "@/domain/state";
import { downloadJson } from "@/services/export";
import styles from "./memory.module.css";

function MemoryCard({ card }: { card: Memory }) {
  const { state, dispatch } = useSession();
  const prefix = "memory.card." + card.id + ".";
  const [editing, setEditing] = useDraft(prefix + "editing");
  const [text, setText] = useDraft(prefix + "text", card.text);
  const [error, setError] = useState("");
  const linkedSteps = state.steps.filter(
    (step) => step.sourceMemoryId === card.id,
  );

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = memoryText.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      focusFirstInvalid(event);
      return;
    }
    dispatch({ type: "memoryEdit", id: card.id, text: parsed.data });
    dispatch({ type: "clearDraft", prefix });
    setError("");
    requestAnimationFrame(() =>
      document.getElementById("card-" + card.id)?.focus(),
    );
  }

  return (
    <li className={styles.card}>
      <p className="eyebrow">Approved {card.at.slice(0, 10)}</p>
      {editing === "yes" ? (
        <form onSubmit={save} noValidate>
          <Field
            label="Edit card"
            value={text}
            onChange={setText}
            multiline
            maxLength={1000}
            error={error}
          />
          <div className="actions">
            <button>Save card changes</button>
            <button
              type="button"
              className="secondary"
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
        <h2 id={"card-" + card.id} tabIndex={-1}>
          {card.text}
        </h2>
      )}
      <p className="meta">Source: {card.source}</p>
      <p className="meta">Editing keeps the original date.</p>
      <div className="actions">
        {editing !== "yes" && (
          <button className="secondary" onClick={() => setEditing("yes")}>
            Edit card
          </button>
        )}
        <ConfirmDelete
          label="Delete card"
          question="Delete this memory card?"
          detail={
            linkedSteps.length
              ? "Suggestions stop using it and its reminder preview is cancelled. Steps you chose from it stay unless you tick the box."
              : "Suggestions stop using it. This can't be undone."
          }
          extra={
            linkedSteps.length
              ? "Also delete " +
                linkedSteps.length +
                (linkedSteps.length === 1 ? " step" : " steps") +
                " chosen from this card"
              : undefined
          }
          onConfirm={(removeSteps) => {
            if (removeSteps)
              linkedSteps.forEach((step) =>
                dispatch({ type: "deleteStep", id: step.id }),
              );
            dispatch({ type: "memoryDelete", id: card.id });
            dispatch({ type: "clearDraft", prefix });
            requestAnimationFrame(() =>
              document.getElementById("approved-cards")?.focus(),
            );
          }}
        />
      </div>
    </li>
  );
}

export function MemoryPage() {
  const { state, dispatch } = useSession();
  const [text, setText] = useDraft("memory.new.text");
  const [status, setStatus] = useDraft("memory.new.status");
  const [receiptId, setReceiptId] = useDraft("memory.new.receiptId");
  const [error, setError] = useState("");
  const blocked = state.temporary || !state.memoryConsent;

  function approve(event: FormEvent) {
    event.preventDefault();
    const result = approveMemory(
      state,
      text,
      "Memory page: explicit preference",
    );
    if (!result.ok) {
      setError(result.error);
      focusFirstInvalid(event);
      return;
    }
    setReceiptId("memory-" + (state.sequence + 1));
    dispatch(result.action);
    setText("");
    setError("");
    setStatus("Card kept for this session. Nothing was sent anywhere.");
  }

  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description="Koe remembers only the words you approve here, with where and when they came from."
      >
        Memory
      </PageHeading>
      <div className={styles.controls}>
        <Toggle
          label="Let suggestions use memory cards"
          checked={state.memoryConsent}
          onChange={(value) => dispatch({ type: "memoryConsent", value })}
        />
        <Toggle
          label="Temporary mode: don't keep or use memory cards"
          checked={state.temporary}
          onChange={(value) => dispatch({ type: "temporary", value })}
        />
        {blocked && (
          <Notice>
            Memory cards are paused. You can still edit, export or delete the
            ones you have.
          </Notice>
        )}
        <p className="hint">
          Cards last only for this session. This is not a promise about how a
          future service would handle logs or backups.
        </p>
      </div>
      <div className={styles.layout}>
        <section aria-labelledby="approved-cards">
          <div className={styles.sectionHead}>
            <h2 id="approved-cards" tabIndex={-1}>
              Your cards
            </h2>
            <span className="meta">
              {state.memories.length} in this session
            </span>
          </div>
          {state.memories.length === 0 ? (
            <Empty>
              No memory cards yet. Suggestions use the built-in examples. You
              can keep a card at the end of a reflection or journal note.
            </Empty>
          ) : (
            <ul className="rows">
              {state.memories.map((card) => (
                <MemoryCard card={card} key={card.id} />
              ))}
            </ul>
          )}
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                downloadJson("koe-synthetic-memory.json", {
                  kind: "synthetic-memory",
                  cards: state.memories,
                })
              }
            >
              Export cards (JSON)
            </button>
          </div>
        </section>
        <section className="panel" aria-labelledby="new-card">
          <h2 id="new-card">Write a card</h2>
          <p>
            Nothing is remembered automatically. Keep only what you want
            suggestions to use.
          </p>
          <form onSubmit={approve} noValidate>
            <Field
              label="New card"
              value={text}
              onChange={setText}
              multiline
              maxLength={1000}
              error={error}
            />
            <button disabled={blocked}>Keep this card</button>
          </form>
          {status && (
            <Notice>
              {state.memories.some((card) => card.id === receiptId)
                ? status
                : "That card was deleted. Suggestions no longer use it."}
            </Notice>
          )}
        </section>
      </div>
    </>
  );
}
