"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import type { RiskLevel } from "@/domain/safety";
import { saveCarePrep } from "@/server/actions/connect";
import { copyText } from "@/services/clipboard";
import { SafetyCheck } from "../safety/safety-check";

export function CarePreparation({
  facts,
  region,
}: {
  /** Plain lines built from the person's own records, which they can edit. */
  facts: string[];
  region: string | null;
}) {
  const [summary, setSummary] = useState(facts.join("\n"));
  const [say, setSay] = useState("");
  const [ask, setAsk] = useState("");
  const [easier, setEasier] = useState("");
  const [status, setStatus] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  const text = useMemo(
    () =>
      [
        summary.trim() && "How things have been:\n" + summary.trim(),
        say.trim() && "What I want to say:\n" + say.trim(),
        ask.trim() && "What I want to ask:\n" + ask.trim(),
        easier.trim() && "What would make this easier:\n" + easier.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    [summary, say, ask, easier],
  );
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint">{hint}</p>}
      <textarea
        id={id}
        rows={3}
        maxLength={1500}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setStatus("");
        }}
      />
    </div>
  );
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  return (
    <div className="prose">
      {field(
        "care-summary",
        "How things have been",
        summary,
        setSummary,
        "Filled in from what you've recorded in Koe. Change or remove anything; share only what you want.",
      )}
      {field(
        "care-say",
        "What you want to say",
        say,
        setSay,
        "For example: how long you've felt this way, sleep, appetite, what's hardest.",
      )}
      {field("care-ask", "What you want to ask", ask, setAsk)}
      {field(
        "care-easier",
        "What would make the appointment easier",
        easier,
        setEasier,
        "For example: bringing someone, writing things down, a longer slot.",
      )}
      <h2>Your summary</h2>
      <pre className="panel care-preview">{text || "Nothing yet."}</pre>
      <div className="actions">
        <button
          type="button"
          disabled={!text}
          onClick={async () => {
            try {
              await copyText(text);
              setStatus("Copied. Nothing was sent.");
            } catch {
              setStatus("Copying didn't work here. Select the text yourself.");
            }
          }}
        >
          Copy
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!text}
          onClick={() => window.print()}
        >
          Print
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!text || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveCarePrep(text);
              setStatus("Saved to your Journey as a note.");
              setSafety(r.safety ?? "none");
            })
          }
        >
          Save as a note
        </button>
      </div>
      {status && <Notice>{status}</Notice>}
      <p className="meta">
        Want help working out what to say?{" "}
        <Link href="/reflect/talk?mode=care">Talk it through with Koe</Link>
      </p>
    </div>
  );
}
