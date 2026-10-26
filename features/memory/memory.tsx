"use client";

import { useState, type FormEvent } from "react";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
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
            label="Edit memory card"
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
      <p className="meta">
        Approval date is retained when you edit the wording.
      </p>
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
            state.steps.some((step) => step.sourceMemoryId === card.id)
              ? "Ideas will stop using it and any reminder preview linked to it is cancelled. Steps you already chose from it stay in Steps; remove them there if you want."
              : "Ideas will stop using it. This cannot be undone."
          }
          onConfirm={() => {
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
    setStatus(
      "Memory card approved for this session. Nothing was sent to a provider.",
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Settings · approved memory"
        description="Cards contain your approved words, with their source and approval date. You can change or remove them."
      >
        Only what you choose to keep.
      </PageHeading>
      <div className={styles.controls}>
        <Toggle
          label="Allow approved memory in suggestions"
          checked={state.memoryConsent}
          onChange={(value) => dispatch({ type: "memoryConsent", value })}
        />
        <Toggle
          label="Temporary mode: do not create or retrieve memory"
          checked={state.temporary}
          onChange={(value) => dispatch({ type: "temporary", value })}
        />
        {blocked && (
          <Notice>
            Memory approval and retrieval are paused. Existing cards remain
            visible for inspection, export or deletion.
          </Notice>
        )}
        <p className="hint">
          All cards are session-only in this review build. This control is not a
          promise about a future provider, logs or backups.
        </p>
      </div>
      <div className={styles.layout}>
        <section aria-labelledby="approved-cards">
          <div className={styles.sectionHead}>
            <h2 id="approved-cards" tabIndex={-1}>
              Approved cards
            </h2>
            <span className="meta">
              {state.memories.length} in this session
            </span>
          </div>
          {state.memories.length === 0 ? (
            <Empty>
              No approved memory cards. Suggestions use only the fictional
              defaults.
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
              Export memory JSON
            </button>
          </div>
        </section>
        <section className="panel" aria-labelledby="new-card">
          <h2 id="new-card">A card in your words.</h2>
          <p>
            No text is remembered automatically. Approve only what you want
            later suggestions to use.
          </p>
          <form onSubmit={approve} noValidate>
            <Field
              label="New memory card"
              value={text}
              onChange={setText}
              multiline
              maxLength={1000}
              error={error}
            />
            <button disabled={blocked}>Approve new memory</button>
          </form>
          {status && (
            <Notice>
              {state.memories.some((card) => card.id === receiptId)
                ? status
                : "The previously approved card has been deleted. It is no longer used in new suggestions."}
            </Notice>
          )}
        </section>
      </div>
      <div className="actions">
        <ActionLink href="/reflect/conversation" secondary>
          Scripted conversation
        </ActionLink>
        <ActionLink href="/reflect/journal" secondary>
          Energy & journal
        </ActionLink>
        <ActionLink href="/reflect/thoughts" secondary>
          Thought reflection
        </ActionLink>
      </div>
    </>
  );
}
