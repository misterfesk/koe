"use client";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  kindLabel,
  sizeLabels,
  type PlanKind,
  type PlanSize,
} from "@/domain/plan-menu";
import { resultLines, type ToolProposal } from "@/domain/talk-tools";
import { formatClock } from "@/domain/time";
import { confirmProposal, dismissProposal } from "@/server/actions/talk";
import { copyText } from "@/services/clipboard";
import { enableNotifications, useAllowed } from "../reminders/notifications";
import type { PushState } from "../reminders/remind-control";
import styles from "./talk.module.css";

const memoryKindLabels = {
  helps: "What helps",
  hard: "What gets in the way",
  people: "People",
  preference: "How you like things",
} as const;

const goalWords: Record<string, string> = {
  through_day: "getting through the day",
  sleep: "sleep",
  energy: "energy",
  less_alone: "feeling less alone",
  enjoy_again: "enjoying things again",
  work_study: "work or study",
  basics: "looking after the basics",
};

type Card = {
  eyebrow: string;
  headline: string;
  detail?: string;
  confirm: string;
};

function describe(t: ToolProposal, clock: (m: number) => string): Card {
  const a = t.args;
  const title = t.meta?.title ?? "this";
  switch (t.name) {
    case "add_item":
      return {
        eyebrow: "Add to today",
        headline: String(a.title),
        detail: `${kindLabel(a.kind as PlanKind)} · ${sizeLabels[a.size as PlanSize]}${
          typeof a.minuteOfDay === "number" ? " · " + clock(a.minuteOfDay) : ""
        }`,
        confirm: "Add to today",
      };
    case "move_item": {
      const to = clock(Number(a.minuteOfDay));
      return {
        eyebrow: "Move to a different time",
        headline: `${title} to ${to}`,
        detail:
          typeof t.meta?.from === "number"
            ? `Now at ${clock(t.meta.from)}.`
            : undefined,
        confirm: `Move to ${to}`,
      };
    }
    case "shrink_item":
      return {
        eyebrow: "Make it smaller",
        headline: title,
        detail:
          typeof a.smallerTitle === "string"
            ? `Smaller version: ${a.smallerTitle}`
            : undefined,
        confirm: "Make it smaller",
      };
    case "set_reminder":
      return typeof a.morningPlan === "string"
        ? {
            eyebrow: "Reminder",
            headline: `Morning plan reminder at ${clock(
              Number(a.morningPlan.slice(0, 2)) * 60 +
                Number(a.morningPlan.slice(3)),
            )}`,
            detail: "It says only that your day is ready.",
            confirm: "Turn on reminder",
          }
        : {
            eyebrow: "Reminder",
            headline: `Remind you about ${title}`,
            detail:
              typeof t.meta?.from === "number"
                ? `At ${clock(t.meta.from)}. A reminder shows only the time, never what it is.`
                : undefined,
            confirm: "Turn on reminder",
          };
    case "save_memory":
      return {
        eyebrow: `Remember this? · ${memoryKindLabels[a.kind as keyof typeof memoryKindLabels]}`,
        headline: String(a.text),
        detail:
          "Koe uses memory cards to suggest things that fit you. You can see, edit or delete them in You.",
        confirm: "Remember",
      };
    case "find_resources":
      return {
        eyebrow: "Look for something to read",
        headline: `Something about ${goalWords[String(a.goal)] ?? "this"}`,
        detail: `Koe would search for: “${t.query ?? ""}”. Only these words are used. Nothing you wrote is included.`,
        confirm: "Look for this",
      };
    case "draft_message":
      return {
        eyebrow: `A message for ${title}`,
        headline: "",
        confirm: "Copy",
      };
    case "prepare_appointment":
      return {
        eyebrow: "Appointment",
        headline: "Put together notes for your appointment",
        detail:
          "They come from your own records and stay here unless you copy them.",
        confirm: "Open appointment notes",
      };
  }
}

/** One of Koe's offers. Nothing happens until the person confirms; "No thanks" writes nothing. */
export function ToolCard({
  messageId,
  tool,
  push,
  hour12,
}: {
  messageId: string;
  tool: ToolProposal;
  push: PushState;
  hour12: boolean;
}) {
  const clock = (m: number) => formatClock(m, hour12);
  const card = describe(tool, clock);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(
    tool.status === "done" ? (tool.result ?? "") : "",
  );
  const [gone, setGone] = useState(tool.status === "dismissed");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [memory, setMemory] = useState(String(tool.args.text ?? ""));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(tool.args.draft ?? ""));
  const allowed = useAllowed();
  const fieldId = useId();
  const isDraft = tool.name === "draft_message";
  // A draft stays usable (copy again, open in another app) until it is dismissed.
  const decided = !!result && !isDraft;

  const confirm = (extra?: { text?: string; via?: "copy" | "sms" | "email" }) =>
    startTransition(async () => {
      setError("");
      const r = await confirmProposal(messageId, tool.id, extra);
      if (r.ok) setResult(r.result);
      else setError(r.error);
    });

  const turnOnReminder = () => {
    // The browser's own question comes only after a line saying what it is for.
    if (!(allowed && push.subscribed) && push.publicKey) return setAsking(true);
    return confirm();
  };

  const allowThenConfirm = () =>
    startTransition(async () => {
      setError("");
      const r = await enableNotifications(push.publicKey!);
      if (!r.ok) return setError(r.message);
      const done = await confirmProposal(messageId, tool.id);
      if (done.ok) setResult(done.result);
      else setError(done.error);
    });

  if (gone)
    return (
      <div className={styles.proposal}>
        <p className="meta">{resultLines.dismissed()}</p>
      </div>
    );

  return (
    <div
      className={styles.proposal}
      role="group"
      aria-label={card.eyebrow.split(" · ")[0]}
    >
      <p className="eyebrow">{card.eyebrow}</p>
      {tool.name === "save_memory" && editing ? (
        <div className="field">
          <label htmlFor={fieldId}>In your words</label>
          <input
            id={fieldId}
            value={memory}
            maxLength={200}
            onChange={(e) => setMemory(e.target.value)}
          />
        </div>
      ) : isDraft ? (
        <div className="field">
          <label htmlFor={fieldId}>Change anything so it sounds like you</label>
          <textarea
            id={fieldId}
            rows={4}
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      ) : (
        <p className={styles.proposalTitle}>
          {tool.name === "save_memory" ? memory : card.headline}
        </p>
      )}
      {card.detail && <p className="meta">{card.detail}</p>}
      {asking && !decided && (
        <p className="meta">
          Your browser will ask to show notifications. A reminder shows only the
          time, never what it is.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="meta" role="status">
          {result}
        </p>
      )}
      {!decided && (
        <div className="actions">
          {isDraft ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  try {
                    await copyText(draft);
                    confirm({ via: "copy" });
                  } catch {
                    setError(
                      "Copying didn't work here. Select the text and copy it yourself.",
                    );
                  }
                }}
              >
                Copy
              </button>
              <a
                className="button secondary"
                href={"sms:?&body=" + encodeURIComponent(draft)}
                onClick={() => confirm({ via: "sms" })}
              >
                Open in Messages
              </a>
              {tool.meta?.channel === "email" && (
                <a
                  className="button secondary"
                  href={"mailto:?body=" + encodeURIComponent(draft)}
                  onClick={() => confirm({ via: "email" })}
                >
                  Open in email
                </a>
              )}
            </>
          ) : tool.name === "prepare_appointment" ? (
            <Link className="button" href="/you/care" onClick={() => confirm()}>
              {card.confirm} <span aria-hidden="true">→</span>
            </Link>
          ) : tool.name === "set_reminder" && asking ? (
            <button type="button" disabled={pending} onClick={allowThenConfirm}>
              Allow and remind me
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                tool.name === "set_reminder"
                  ? turnOnReminder()
                  : confirm(
                      tool.name === "save_memory"
                        ? { text: memory }
                        : undefined,
                    )
              }
            >
              {card.confirm}
            </button>
          )}
          {tool.name === "save_memory" && !editing && (
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
              startTransition(async () => {
                const r = await dismissProposal(messageId, tool.id);
                if (r.ok) setGone(true);
              })
            }
          >
            No thanks
          </button>
        </div>
      )}
    </div>
  );
}
