"use client";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import type { RiskLevel } from "@/domain/safety";
import { resumeConversation, sendMessage } from "@/server/actions/talk";
import { modeLabels, type TalkMode } from "@/domain/talk";
import type { MessageView } from "@/server/data/talk";
import { SafetyCheck } from "../safety/safety-check";
import type { PushState } from "../reminders/remind-control";
import { ToolCard } from "./proposals";
import styles from "./talk.module.css";

const openers: Record<TalkMode, string> = {
  talk: "What's on your mind? Say as much or as little as you like.",
  plan: "What would you like to do a bit more of, or used to enjoy?",
  problem: "What's the practical problem? One thing, as specific as you can.",
  thought:
    "What's a thought that's been bothering you? Where were you when it came up?",
  reach: "Who would you like to get in touch with, and what's it about?",
  care: "What's the appointment, and what would you like to get across?",
};

export function Conversation({
  id,
  mode: initialMode,
  messages,
  paused,
  region,
  push,
  hour12,
  onChanged,
}: {
  id: string | null;
  mode: TalkMode;
  messages: MessageView[];
  paused: boolean;
  region: string | null;
  push: PushState;
  hour12: boolean;
  /** Set by the side panel: reload this conversation instead of changing the page. */
  onChanged?: (conversationId: string) => void | Promise<void>;
  /** What the person opened Talk from (used by Stuck? Ask Koe, A4b). */
  context?: { kind: "thing" | "day"; id: string };
}) {
  const inputId = useId();
  const router = useRouter();
  const [mode, setMode] = useState<TalkMode>(initialMode);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [safety, setSafety] = useState<RiskLevel>(paused ? "concern" : "none");
  const [pending, startTransition] = useTransition();
  const [shown, addShown] = useOptimistic(messages, (list, content: string) => [
    ...list,
    {
      id: "pending",
      role: "user" as const,
      content,
      proposals: null,
      createdAt: new Date().toISOString(),
    },
  ]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [shown.length, pending]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (pending) return;
    const content = text.trim();
    if (!content) return setError("Write something first.");
    setError("");
    setNotice("");
    setText("");
    startTransition(async () => {
      addShown(content);
      const r = await sendMessage({
        conversationId: id ?? undefined,
        mode,
        text: content,
      });
      if (!r.ok) {
        setText(content);
        return setError(r.error);
      }
      setSafety(r.safety);
      // Paused before anything was saved: keep the words for after "Carry on".
      if (r.conversationId === null) return setText(content);
      if (r.unavailable)
        setNotice(
          "Koe can't reply right now. What you wrote is saved. Try again in a little while.",
        );
      if (onChanged) await onChanged(r.conversationId);
      else if (!id) router.replace("/talk/" + r.conversationId);
    });
  }

  const blocked = safety !== "none" || paused;

  return (
    <div className={styles.talk}>
      <p className={styles.disclosure}>
        Koe is an AI, not a person or a therapist. It can get things wrong.
      </p>
      {!id && (
        <fieldset className="chips">
          <legend>What would help?</legend>
          {(Object.keys(modeLabels) as TalkMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="chip small"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {modeLabels[m]}
            </button>
          ))}
        </fieldset>
      )}
      <ol className={styles.messages} aria-label="Conversation">
        <li className={styles.koe}>
          <span className={styles.who}>Koe</span>
          <p>{openers[mode]}</p>
        </li>
        {shown.map((m) => (
          <li
            key={m.id}
            className={
              m.role === "user"
                ? styles.you
                : m.role === "safety"
                  ? styles.safetyNote
                  : styles.koe
            }
          >
            <span className={styles.who}>
              {m.role === "user" ? "You" : "Koe"}
            </span>
            <p>{m.content}</p>
            {id &&
              m.role === "assistant" &&
              m.proposals?.tools.map((t) => (
                <ToolCard
                  key={t.id}
                  messageId={m.id}
                  tool={t}
                  push={push}
                  hour12={hour12}
                />
              ))}
          </li>
        ))}
        {pending && (
          <li className={styles.koe} aria-live="polite">
            <span className={styles.who}>Koe</span>
            <p className="meta">Thinking…</p>
          </li>
        )}
      </ol>
      <div ref={end} />
      {blocked ? (
        <SafetyCheck
          region={region}
          resume={id ? () => resumeConversation(id) : undefined}
          onResume={() => setSafety("none")}
        />
      ) : (
        <form onSubmit={send} className={styles.composer}>
          <label htmlFor={inputId} className="sr-only">
            Your message
          </label>
          <textarea
            id={inputId}
            rows={3}
            maxLength={4000}
            value={text}
            placeholder="Type here"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
            aria-invalid={!!error}
            aria-describedby={error ? inputId + "-error" : undefined}
          />
          {error && (
            <p id={inputId + "-error"} className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <div className="actions">
            <button type="submit" disabled={pending}>
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
