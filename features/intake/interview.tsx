"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AskCard, ChatThread, TypingDots } from "@/components/chat";
import { ConfirmDelete } from "@/components/ui";
import type { IntakeInput } from "@/domain/intake";
import type { WeekDraft, WeekView } from "@/domain/week";
import {
  advanceInterview,
  saveInterviewWeek,
  startInterview,
  type InterviewResult,
} from "@/server/actions/interview";
import { SafetyCheck } from "../safety/safety-check";
import {
  clearInterviewDraft,
  interviewAnswer,
  readInterviewDraft,
  writeInterviewDraft,
  type InterviewDraft,
} from "./interview-draft";
import { WeekReveal } from "./week-reveal";
import styles from "./intake.module.css";

export function WorkInterview({
  owner,
  region,
  intake,
  seed = "",
  week,
  onReady,
  onSkip,
}: {
  owner: string;
  region: string | null;
  intake?: IntakeInput;
  seed?: string;
  week?: WeekView | null;
  onReady?: (token: string, draft: WeekDraft) => Promise<void>;
  onSkip?: () => Promise<void>;
}) {
  const router = useRouter();
  const mode = onReady ? "intro" : "return";
  const [state, setState] = useState<InterviewDraft | null>(null);
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [restart, setRestart] = useState(false);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const count = useRef(0);
  const hasProposal = Boolean(state?.draft);
  const remember = (next: InterviewDraft) => {
    setState(next);
    writeInterviewDraft(owner, mode, next);
  };
  function receive(
    result: InterviewResult,
    previous: InterviewDraft | null,
    text?: string,
  ): InterviewDraft | null {
    if (!result.ok) {
      setError(result.error);
      setRestart(/Open|changed|again before/.test(result.error));
      return null;
    }
    if (result.safety !== "none" || result.paused) {
      if (previous) remember({ ...previous, answer: "" });
      setFlagged(true);
      return null;
    }
    if (result.unavailable) {
      setError(
        "Your answer couldn't be checked. Try again. Your draft is kept.",
      );
      return null;
    }
    if (!result.token) {
      setError("Your interview couldn't load. Try again.");
      return null;
    }
    const messages = [...(previous?.messages ?? [])];
    if (previous?.turn && text)
      messages.push({
        id: `q-${count.current++}`,
        role: "assistant",
        text: previous.turn.message,
      });
    if (text) messages.push({ id: `a-${count.current++}`, role: "user", text });
    const next = {
      token: result.token,
      turn: result.turn,
      ...(result.draft ? { draft: result.draft } : {}),
      answer: "",
      selected: [],
      messages: messages.slice(-20),
    };
    remember(next);
    return next;
  }
  async function open(preservedAnswer = "") {
    setError("");
    setRestart(false);
    try {
      const opened = receive(
        await startInterview({
          ...(intake ? { intake } : {}),
          ...(week ? { weekId: week.id, expectedVersion: week.version } : {}),
        }),
        null,
      );
      let next = opened;
      if (opened && seed.trim())
        next = receive(
          await advanceInterview({
            token: opened.token,
            text: seed.trim(),
            intent: "answer",
          }),
          opened,
          seed.trim(),
        );
      if (next && preservedAnswer)
        remember({ ...next, answer: preservedAnswer });
    } catch {
      setError("Your interview couldn't load. Try again. Your draft is kept.");
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = readInterviewDraft(owner, mode);
    if (saved) {
      // Browser state is owner-scoped; the server checks its encrypted token on use.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(saved);
      if (!saved.turn && !saved.draft) setRestart(true);
      count.current = saved.messages.length;
    } else startTransition(open);
    // Start once for this owner; returning props must not restart an active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [state?.turn?.message, hasProposal, flagged]);

  function send() {
    if (!state || pending) return;
    const selected = state.selected ?? [];
    const option = state.turn?.ask?.options?.find((o) =>
      selected.includes(o.id),
    );
    const confirming = state.turn?.phase === "confirming";
    const intent =
      confirming && option && ["propose", "add", "finish"].includes(option.id)
        ? (option.id as "propose" | "add" | "finish")
        : "answer";
    if (intent === "finish") {
      enough();
      return;
    }
    const text = interviewAnswer(state);
    if (intent === "answer" && !text) {
      setError("Give it a few words, or stop here for now.");
      return;
    }
    if (intent === "answer" && text.length > 400) {
      setError(
        "Keep your answer within 400 characters. Shorten your words or unselect an option.",
      );
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        receive(
          await advanceInterview({
            token: state.token,
            ...(intent === "answer" ? { text } : {}),
            intent,
          }),
          state,
          text,
        );
      } catch {
        setError(
          "Your answer couldn't be confirmed. Try again. Your draft is kept.",
        );
      }
    });
  }
  function enough() {
    if (pending) return;
    setError("");
    startTransition(async () => {
      try {
        if (onSkip) await onSkip();
        else router.replace("/today");
      } catch {
        setError("Your day couldn't load. Try again. Your draft is kept.");
      }
    });
  }
  function approve() {
    if (!state?.draft || pending) return;
    setError("");
    startTransition(async () => {
      try {
        if (onReady) {
          await onReady(state.token, state.draft!);
          return;
        }
        const result = await saveInterviewWeek({
          token: state.token,
          draft: state.draft,
        });
        if (!result.ok) {
          setError(result.error);
          setRestart(/Open|changed|again before/.test(result.error));
          return;
        }
        if (result.safety !== "none") {
          setFlagged(true);
          return;
        }
        if (result.unavailable || !result.week) {
          setError(
            "Your week couldn't be confirmed. Try Save this week again.",
          );
          return;
        }
        clearInterviewDraft(owner, mode);
        router.replace("/today");
      } catch {
        setError(
          "Your week couldn't be confirmed. Try again. Your draft is kept.",
        );
      }
    });
  }
  if (flagged)
    return (
      <SafetyCheck
        region={region}
        onResume={() => {
          setFlagged(false);
          setRestart(true);
          setError("Open the interview again when you're ready.");
        }}
      />
    );
  const turn = state?.turn;
  const selected = state?.selected ?? [];
  return (
    <div className={styles.chatIntake}>
      <header
        className={`page-heading ${hasProposal ? styles.proposalHeading : ""}`}
      >
        <p className="eyebrow">This week</p>
        <h1 ref={heading} tabIndex={-1}>
          {state?.draft
            ? "Your week, in smaller pieces"
            : (turn?.message ?? "Your week")}
        </h1>
      </header>
      {state && !state.draft && turn?.ask && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.target instanceof HTMLTextAreaElement
            ) {
              event.preventDefault();
              send();
            }
          }}
        >
          <AskCard
            key={state.token}
            ask={turn.ask}
            label={turn.message}
            labelHidden
            value={selected}
            other={state.answer}
            onChange={(value) => {
              remember({
                ...state,
                selected: value,
                answer: turn.ask?.kind === "multi" ? state.answer : "",
              });
            }}
            onOtherChange={(answer) => {
              remember({
                ...state,
                answer,
                selected: turn.ask?.kind === "multi" ? selected : [],
              });
            }}
            maxLength={400}
            disabled={pending}
          />
          <div className="actions">
            <button
              type="submit"
              className="secondary"
              disabled={pending || restart}
            >
              {turn.phase === "confirming"
                ? selected[0] === "propose"
                  ? "Show the pieces"
                  : selected[0] === "add"
                    ? "Ask about another thing"
                    : "Choose this"
                : "Reply"}
            </button>
          </div>
        </form>
      )}
      {state?.draft && (
        <>
          <WeekReveal
            draft={state.draft}
            disabled={pending}
            onChange={(draft) => {
              remember({ ...state, draft });
              if (!draft) {
                setRestart(true);
                setError(
                  "Nothing left to save. You can stop here or name something else.",
                );
              }
            }}
          />
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={approve}
            >
              {onReady ? "Review your first day" : "Save this week"}
            </button>
          </div>
          <p className="meta">
            {onReady
              ? "Nothing is saved until you start your day."
              : "Nothing is saved until you tap Save this week."}
          </p>
        </>
      )}
      {pending && (
        <div role="status">
          <span className="sr-only">Checking your answer…</span>
          <TypingDots />
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!pending &&
        (!state || restart) &&
        (state ? (
          <ConfirmDelete
            label="Open interview again"
            question="Start the interview again?"
            detail="Your earlier replies will be replaced. Your current answer stays here."
            onConfirm={() => {
              const saved = readInterviewDraft(owner, mode);
              const answer = saved ? interviewAnswer(saved) : "";
              if (answer.length > 400) {
                setError(
                  "Keep your answer within 400 characters. Shorten your words or unselect an option.",
                );
                return;
              }
              clearInterviewDraft(owner, mode);
              startTransition(() => open(answer));
            }}
          />
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => startTransition(open)}
          >
            Try again
          </button>
        ))}
      <div className={styles.interviewExit}>
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={enough}
        >
          That&apos;s enough for now
        </button>
        <Link href="/today">Leave for Today</Link>
      </div>
      {!!state?.messages.length && (
        <details className={styles.transcript}>
          <summary>Your earlier replies</summary>
          <ChatThread messages={state.messages} status="" />
        </details>
      )}
    </div>
  );
}
