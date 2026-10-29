"use client";
import { Notice } from "@/components/ui";
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
import {
  keepTakeaway,
  resumeConversation,
  sendMessage,
} from "@/server/actions/talk";
import type { TakeawayView } from "@/server/talk-page";
import { modeLabels, modeTemplates, type TalkMode } from "@/domain/talk";
import type { MessageView } from "@/server/data/talk";
import { SafetyCheck } from "../safety/safety-check";
import type { PushState } from "../reminders/remind-control";
import { ToolCard } from "./proposals";
import styles from "./talk.module.css";

const quickActionModes = (Object.keys(modeLabels) as TalkMode[]).filter(
  (m): m is Exclude<TalkMode, "talk"> => m !== "talk",
);

// Deduplicates in-flight auto-sends across StrictMode remounts or double-taps.
const inflightAutoSend = new Map<
  string,
  Promise<Awaited<ReturnType<typeof sendMessage>>>
>();

export function Conversation({
  id,
  mode: initialMode,
  messages,
  paused,
  region,
  push,
  hour12,
  onChanged,
  context,
  focus,
  takeaways = [],
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
  context?: { kind: "thing" | "step" | "day"; id: string };
  /** The task it was opened from: its opener replaces the mode's. */
  focus?: { title: string } | null;
  takeaways?: TakeawayView[];
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [shown.length, pending]);

  function selectMode(m: TalkMode) {
    setMode(m);
    setError("");
    if (m === "talk") {
      if ((Object.values(modeTemplates) as string[]).includes(text)) {
        setText("");
      }
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const tpl = modeTemplates[m];
    setText(tpl);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(tpl.length, tpl.length);
      }
    });
  }

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
        // Only the kind and id: the server loads the task itself.
        ...(!id &&
        focus &&
        (context?.kind === "thing" || context?.kind === "step")
          ? { context: { kind: context.kind, id: context.id } }
          : {}),
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
  const autoSent = useRef(false);

  useEffect(() => {
    if (
      autoSent.current ||
      id ||
      messages.length > 0 ||
      !focus?.title ||
      !context ||
      (context.kind !== "thing" && context.kind !== "step") ||
      blocked
    )
      return;
    autoSent.current = true;
    const content = `Help me with this task: ${focus.title}`;
    const taskCtx = { kind: context.kind, id: context.id };
    const inflightKey = `${taskCtx.kind}:${taskCtx.id}`;
    startTransition(async () => {
      addShown(content);
      let pendingSend = inflightAutoSend.get(inflightKey);
      if (!pendingSend) {
        pendingSend = sendMessage({
          mode,
          text: content,
          context: taskCtx,
        }).finally(() => {
          inflightAutoSend.delete(inflightKey);
        });
        inflightAutoSend.set(inflightKey, pendingSend);
      }
      const r = await pendingSend;
      if (!r.ok) {
        setText(content);
        return setError(r.error);
      }
      setSafety(r.safety);
      if (r.conversationId === null) return setText(content);
      if (r.unavailable)
        setNotice(
          "Koe can't reply right now. What you wrote is saved. Try again in a little while.",
        );
      if (onChanged) await onChanged(r.conversationId);
      else router.replace("/talk/" + r.conversationId);
    });
  }, [
    id,
    messages.length,
    focus?.title,
    context,
    blocked,
    mode,
    addShown,
    onChanged,
    router,
  ]);

  return (
    <div className={styles.talk}>
      <div className={styles.thread}>
        <p className={styles.disclosure}>
          Koe is an AI, not a person or a therapist. It can get things wrong.
        </p>
        {!id && !focus && (
          <fieldset className={styles.quickActions}>
            <legend>What would help?</legend>
            <button
              type="button"
              className={styles.justTalkBtn}
              aria-pressed={mode === "talk"}
              onClick={() => selectMode("talk")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {modeLabels.talk}
            </button>
            <div className={styles.templateActions}>
              {quickActionModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={styles.templateChip}
                  aria-pressed={mode === m}
                  onClick={() => selectMode(m)}
                >
                  {modeLabels[m]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <ol className={styles.messages} aria-label="Conversation">
          <li className={styles.koe}>
            <span className={styles.who}>Koe</span>
            <p>
              {focus
                ? `What's getting in the way with "${focus.title}"?`
                : "What's on your mind?"}
            </p>
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
        {id && takeaways.length > 0 && (
          <Takeaways conversationId={id} items={takeaways} />
        )}
      </div>
      {blocked ? (
        <SafetyCheck
          region={region}
          resume={id ? () => resumeConversation(id) : undefined}
          onResume={() => setSafety("none")}
        />
      ) : (
        <form onSubmit={send} className={styles.composer}>
          {error && (
            <p id={inputId + "-error"} className="error" role="alert">
              {error}
            </p>
          )}
          {notice && <Notice onDismiss={() => setNotice("")}>{notice}</Notice>}
          <label htmlFor={inputId} className="sr-only">
            Your message
          </label>
          <div className={styles.inputRow}>
            <textarea
              ref={inputRef}
              id={inputId}
              rows={2}
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
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={pending}
              aria-label="Send"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22 11 13 2 9 22 2z" />
              </svg>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** What the person said or decided, each keepable as a memory card. */
function Takeaways({
  conversationId,
  items,
}: {
  conversationId: string;
  items: TakeawayView[];
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Takeaways</h2>
      <ul className="plain-list">
        {items.map((t, i) => (
          <Takeaway
            key={i}
            conversationId={conversationId}
            index={i}
            item={t}
          />
        ))}
      </ul>
    </section>
  );
}

function Takeaway({
  conversationId,
  index,
  item,
}: {
  conversationId: string;
  index: number;
  item: TakeawayView;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "kept">(
    item.kept ? "kept" : "idle",
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <p>{item.text}</p>
      {step === "kept" ? (
        <p className="meta" role="status">
          Kept in What Koe knows.
        </p>
      ) : step === "confirm" ? (
        <div className="actions">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await keepTakeaway(conversationId, index);
                if (r.ok) setStep("kept");
                else setError(r.error ?? "");
              })
            }
          >
            Keep it
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setStep("idle")}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="text"
          onClick={() => setStep("confirm")}
        >
          Keep as memory card
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
