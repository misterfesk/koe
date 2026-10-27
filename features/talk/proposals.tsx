"use client";
import { useState, useTransition } from "react";
import { areaLabels } from "@/domain/steps";
import { declineProposal, keepMemory } from "@/server/actions/talk";
import type { Proposals } from "@/server/data/talk";
import { PlanForm } from "../steps/plan-form";
import styles from "./talk.module.css";

const kindLabels = {
  helps: "What helps",
  hard: "What gets in the way",
  people: "People",
  preference: "How you like things",
} as const;

export function StepProposal({
  conversationId,
  messageId,
  step,
  region,
}: {
  conversationId: string;
  messageId: string;
  step: NonNullable<Proposals["step"]>;
  region: string | null;
}) {
  const [planning, setPlanning] = useState(false);
  const [, startTransition] = useTransition();
  const done = () =>
    startTransition(() => declineProposal(conversationId, messageId, "step"));
  return (
    <div className={styles.proposal}>
      <p className="eyebrow">Suggested step · {areaLabels[step.area]}</p>
      {!planning ? (
        <>
          <p className={styles.proposalTitle}>{step.title}</p>
          <div className="actions">
            <button type="button" onClick={() => setPlanning(true)}>
              Plan this step
            </button>
            <button type="button" className="text" onClick={done}>
              No thanks
            </button>
          </div>
        </>
      ) : (
        <PlanForm
          region={region}
          initial={{
            area: step.area,
            title: step.title,
            cue: step.cue,
            sourceConversationId: conversationId,
          }}
          onCancel={() => setPlanning(false)}
          onDone={done}
        />
      )}
    </div>
  );
}

/** Koe proposes; nothing is remembered until the person says yes. */
export function MemoryProposal({
  conversationId,
  messageId,
  memory,
}: {
  conversationId: string;
  messageId: string;
  memory: NonNullable<Proposals["memory"]>;
}) {
  const [text, setText] = useState(memory.text);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.proposal}>
      <p className="eyebrow">Remember this? · {kindLabels[memory.kind]}</p>
      {editing ? (
        <div className="field">
          <label htmlFor={"memory-" + messageId}>In your words</label>
          <input
            id={"memory-" + messageId}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
      ) : (
        <p className={styles.proposalTitle}>{text}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="meta">
        Koe uses memory cards to suggest steps that fit you. You can see, edit
        or delete them in Settings.
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await keepMemory(conversationId, messageId, {
                kind: memory.kind,
                text,
              });
              if (!r.ok) setError(r.error ?? "");
            })
          }
        >
          Remember
        </button>
        {!editing && (
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(true)}
          >
            Edit first
          </button>
        )}
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              declineProposal(conversationId, messageId, "memory"),
            )
          }
        >
          No
        </button>
      </div>
    </div>
  );
}
