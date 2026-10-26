"use client";

import { useState, type FormEvent } from "react";
import { useDraft, useSession } from "@/components/session";
import { Field, Notice } from "@/components/ui";
import { approveMemory } from "@/domain/reflection";

export function MemoryApproval({
  prefix,
  source,
}: {
  prefix: string;
  source: string;
}) {
  const { state, dispatch } = useSession();
  const [text, setText] = useDraft(prefix + ".text");
  const [status, setStatus] = useDraft(prefix + ".status");
  const [receiptId, setReceiptId] = useDraft(prefix + ".receiptId");
  const [error, setError] = useState("");
  const blocked = state.temporary || !state.memoryConsent;

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = approveMemory(state, text, source);
    if (!result.ok) {
      setError(result.error);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setReceiptId("memory-" + (state.sequence + 1));
    dispatch(result.action);
    setText("");
    setError("");
    setStatus(
      "Card approved for this session. You can inspect, edit or delete it in Memory.",
    );
    requestAnimationFrame(() =>
      document.getElementById(prefix + "-status")?.focus(),
    );
  }

  return (
    <details>
      <summary>Prepare a memory card (optional)</summary>
      <p>
        Only the words you explicitly approve become a memory card. No
        interpretation is added.
      </p>
      {blocked && (
        <Notice>
          Memory creation and retrieval are paused. You can keep a draft without
          approving it.
        </Notice>
      )}
      <form onSubmit={submit} noValidate>
        <Field
          label="Optional memory in your words"
          value={text}
          onChange={setText}
          multiline
          maxLength={1000}
          error={error}
        />
        <p className="hint">Provenance: {source}</p>
        <button className="secondary" disabled={blocked}>
          Approve this memory card
        </button>
      </form>
      {status && (
        <Notice id={prefix + "-status"}>
          {state.memories.some((card) => card.id === receiptId)
            ? status
            : "The previously approved card has been deleted. It is no longer used in new suggestions."}
        </Notice>
      )}
    </details>
  );
}
