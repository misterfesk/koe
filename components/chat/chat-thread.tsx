"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Message, type ChatMessage } from "./message";
import { TypingDots } from "./typing-dots";
import styles from "./chat.module.css";

export type ChatThreadProps = {
  /** Checked messages only. Keep streaming drafts out until output checks pass. */
  messages: ChatMessage[];
  loading?: boolean;
  children?: ReactNode;
  /** Disable following entirely, e.g. while navigating an older conversation. */
  autoScroll?: boolean;
  onFollowChange?: (following: boolean) => void;
  /** Override the one live region, e.g. for an error. */
  status?: string;
  label?: string;
};

export function ChatThread({
  messages,
  loading = false,
  children,
  autoScroll = true,
  onFollowChange,
  status,
  label = "Conversation",
}: ChatThreadProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = messages.at(-1);
  useEffect(() => {
    const element = viewport.current;
    if (element && autoScroll && following.current)
      element.scrollTop = element.scrollHeight;
  }, [messages, loading, children, autoScroll]);

  return (
    <section className={styles.thread} aria-label={label}>
      <div
        ref={viewport}
        className={styles.transcript}
        role="log"
        aria-label="Messages"
        aria-live="off"
        tabIndex={0}
        onScroll={() => {
          const element = viewport.current;
          if (!element) return;
          const next =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            48;
          if (next !== following.current) {
            following.current = next;
            onFollowChange?.(next);
          }
        }}
      >
        {messages.map((message) => (
          <Message key={message.id} role={message.role} text={message.text} />
        ))}
        {loading && <TypingDots />}
        {children}
      </div>
      <p className={styles.srOnly} role="status" aria-atomic="true">
        {status ??
          (loading
            ? "Koe is replying."
            : last?.role === "assistant"
              ? last.text
              : "")}
      </p>
    </section>
  );
}
