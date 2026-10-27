"use client";
import { useState, useTransition } from "react";
import { ConfirmDelete, Field } from "@/components/ui";
import type { RiskLevel } from "@/domain/safety";
import {
  editSummary,
  removeMemory,
  saveMemory,
  setPrivacy,
  toggleMemoryUse,
} from "@/server/actions/settings";
import type { MemoryKind, MemoryView } from "@/server/data/memory";
import { SafetyCheck } from "../safety/safety-check";

const kinds: [MemoryKind, string, string][] = [
  [
    "helps",
    "What helps",
    "Short walks outside help me more than sitting still",
  ],
  ["hard", "What gets in the way", "Mornings are hardest for me"],
  ["people", "People", "My sister Mia is easy to talk to"],
  ["preference", "How you like things", "I prefer plain, direct suggestions"],
];

/** What Koe understood in the intro, as the person approved it. Editable. */
export function SummaryCard({
  summary,
  region,
}: {
  summary: string;
  region: string | null;
}) {
  const [text, setText] = useState(summary);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await editSummary(text);
          if (!r.ok) return setError(r.error ?? "");
          setError("");
          setSaved(true);
          setSafety(r.safety ?? "none");
        });
      }}
    >
      <Field
        label="Here's what I understood"
        value={text}
        onChange={(t) => {
          setText(t);
          setSaved(false);
        }}
        multiline
        grow
        maxLength={400}
        error={error}
      />
      <div className="actions">
        <button className="secondary" disabled={pending || text === summary}>
          Save summary
        </button>
        {saved && (
          <p className="meta" role="status">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function MemoryCards({
  cards,
  memoryOn,
  region,
}: {
  cards: MemoryView[];
  memoryOn: boolean;
  region: string | null;
}) {
  const [, startTransition] = useTransition();
  return (
    <>
      <label className="toggle">
        <input
          type="checkbox"
          checked={memoryOn}
          onChange={(e) =>
            startTransition(() => setPrivacy({ memoryOn: e.target.checked }))
          }
        />
        <span>
          Memory is {memoryOn ? "on" : "off"}.{" "}
          {memoryOn
            ? "Koe can use these cards in Talk and suggestions, and may ask to remember new ones."
            : "Koe won't use these cards or ask to remember anything. Your cards are kept."}
        </span>
      </label>
      {kinds.map(([kind, label, example]) => {
        const list = cards.filter((c) => c.kind === kind);
        return (
          <section key={kind} aria-labelledby={"kind-" + kind}>
            <h2 id={"kind-" + kind}>{label}</h2>
            {list.length > 0 && (
              <ul className="rows">
                {list.map((c) => (
                  <Card key={c.id} card={c} region={region} />
                ))}
              </ul>
            )}
            <AddCard kind={kind} example={example} region={region} />
          </section>
        );
      })}
    </>
  );
}

function Card({ card, region }: { card: MemoryView; region: string | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.text);
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  return (
    <li>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveMemory({
                id: card.id,
                kind: card.kind,
                text,
              });
              if (!r.ok) return setError(r.error ?? "");
              setEditing(false);
              setSafety(r.safety ?? "none");
            });
          }}
        >
          <label htmlFor={"card-" + card.id} className="sr-only">
            Edit memory card
          </label>
          <input
            id={"card-" + card.id}
            className="inline-edit"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
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
                setText(card.text);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{card.text}</p>
          <p className="meta">
            {card.source === "talk"
              ? "Kept from a conversation"
              : card.source === "report"
                ? "Kept from your Journey"
                : card.source === "intro"
                  ? "From your intro"
                  : "Added by you"}
            {card.useForSuggestions ? "" : " · Not used for suggestions"}
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="text"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="text"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  toggleMemoryUse(card.id, !card.useForSuggestions),
                )
              }
            >
              {card.useForSuggestions
                ? "Don't use for suggestions"
                : "Use for suggestions"}
            </button>
            <ConfirmDelete
              label="Delete"
              question="Delete this memory card?"
              detail="Steps that came from it stay."
              onConfirm={() => startTransition(() => removeMemory(card.id))}
            />
          </div>
        </>
      )}
      {safety !== "none" && (
        <SafetyCheck region={region} onResume={() => setSafety("none")} />
      )}
    </li>
  );
}

function AddCard({
  kind,
  example,
  region,
}: {
  kind: MemoryKind;
  example: string;
  region: string | null;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await saveMemory({ kind, text });
          if (!r.ok) return setError(r.error ?? "");
          setError("");
          setText("");
          setSafety(r.safety ?? "none");
        });
      }}
    >
      <div className="field">
        <label htmlFor={"add-" + kind} className="sr-only">
          Add a card
        </label>
        <input
          id={"add-" + kind}
          value={text}
          maxLength={200}
          placeholder={example}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "add-error-" + kind : undefined}
        />
        {error && (
          <p id={"add-error-" + kind} className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button className="secondary" disabled={pending}>
        Add
      </button>
    </form>
  );
}
