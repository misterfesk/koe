"use client";

import { useState, type FormEvent } from "react";
import { useDraft, useSession } from "@/components/session";
import { Field, Notice, focusFirstInvalid } from "@/components/ui";
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
      focusFirstInvalid(event);
      return;
    }
    setReceiptId("memory-" + (state.sequence + 1));
    dispatch(result.action);
    setText("");
    setError("");
    setStatus(
      "Memory card kept for this session. Edit or delete it any time in Settings → Memory.",
    );
    requestAnimationFrame(() =>
      document.getElementById(prefix + "-status")?.focus(),
    );
  }

  return (
    <details>
      <summary>Keep a memory card</summary>
      <p>
        Write what later suggestions should remember, in your words. Koe keeps
        exactly what you approve and adds nothing.
      </p>
      {blocked && (
        <Notice>Memory cards are paused, so this can only stay a draft.</Notice>
      )}
      <form onSubmit={submit} noValidate>
        <Field
          label="Memory card"
          value={text}
          onChange={setText}
          multiline
          maxLength={1000}
          error={error}
        />
        <p className="hint">Saved with its source: {source.split(":")[0]}</p>
        <button className="secondary" disabled={blocked}>
          Keep this card
        </button>
      </form>
      {status && (
        <Notice id={prefix + "-status"}>
          {state.memories.some((card) => card.id === receiptId)
            ? status
            : "That card was deleted. Suggestions no longer use it."}
        </Notice>
      )}
    </details>
  );
}
