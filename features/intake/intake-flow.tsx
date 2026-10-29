"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AskCard } from "@/components/chat";
import { ActionLink } from "@/components/ui";
import type { ChatAsk } from "@/domain/chat-turn";
import type { WeekDraft } from "@/domain/week";
import {
  dayKinds,
  dayLabels,
  goalLabels,
  goals,
  liftLabels,
  lifts,
  type Reveal as RevealData,
} from "@/domain/intake";
import { buildReveal, checkIntakeText } from "@/server/actions/intake";
import { SafetyCheck } from "../safety/safety-check";
import {
  blankDraft,
  loadDraft,
  saveDraft,
  toModel,
  type IntakeDraft,
  type IntakeStage,
} from "./draft-store";
import { RevealScreen } from "./reveal";
import { WorkInterview } from "./interview";
import styles from "./intake.module.css";

type Stage = IntakeStage | "thinking" | "reveal";
const titles = [
  "",
  "What would help most right now?",
  "What fills your days?",
  "What used to lift you?",
  "Tell me one thing you'd like to get done this week.",
];
const options = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
) => values.map((id) => ({ id, label: labels[id] }));
const asks: Record<number, ChatAsk> = {
  1: {
    kind: "multi",
    options: options(goals, goalLabels),
    allowOther: true,
    placeholder: "e.g. Getting out of bed feels hard.",
    info: "Pick up to two. Your answers shape your first day.",
  },
  2: {
    kind: "single",
    options: options(dayKinds, dayLabels),
    allowOther: true,
    placeholder: "e.g. You work nights and care for your dad.",
  },
  3: {
    kind: "multi",
    options: options(
      lifts.filter((v) => v !== "other"),
      liftLabels,
    ),
    allowOther: true,
    placeholder: "e.g. Playing old records on Sunday mornings.",
  },
  4: {
    kind: "text",
    allowOther: false,
    placeholder: "e.g. Updating my CV. I open it, then close it again.",
    info: "This gives your first plan something concrete to start from. A few words are enough.",
  },
};
const textKey = (q: number) =>
  (q === 1
    ? "goalsNote"
    : q === 2
      ? "dayNote"
      : q === 3
        ? "liftsNote"
        : "puttingOff") as keyof Pick<
    IntakeDraft,
    "goalsNote" | "dayNote" | "liftsNote" | "puttingOff"
  >;
const hasAnswer = (d: IntakeDraft, q: number) =>
  Boolean(
    d[textKey(q)].trim() ||
    (q === 1
      ? d.goals.length
      : q === 2
        ? d.days.length
        : q === 3
          ? d.lifts.length
          : 0),
  );
function cleared(d: IntakeDraft, q: number): IntakeDraft {
  return {
    ...d,
    [textKey(q)]: "",
    ...(q === 1
      ? { goals: [] }
      : q === 2
        ? { days: [] }
        : q === 3
          ? { lifts: [] }
          : {}),
  };
}
export function IntakeFlow({
  region,
  publicKey,
  hour12,
  owner,
}: {
  region: string | null;
  publicKey: string | null;
  hour12: boolean;
  owner?: string;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [draft, setDraft] = useState<IntakeDraft>(blankDraft);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [week, setWeek] = useState<{ token: string; draft: WeekDraft }>();
  const [flag, setFlag] = useState<Stage | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [restored, setRestored] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  useEffect(() => {
    const saved = loadDraft(owner);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) {
      setDraft(saved.draft);
      setStage(saved.stage);
      if (saved.notice) setError(saved.notice);
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [owner]);
  useEffect(() => {
    if (restored)
      saveDraft(
        {
          version: 2,
          stage:
            stage === "thinking" || stage === "reveal"
              ? week
                ? "interview"
                : 4
              : stage,
          draft,
        },
        owner,
      );
  }, [restored, stage, draft, owner, week]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [stage, flag, restored]);

  const finish = async (d: IntakeDraft, forceFallback = false) => {
    setStage("thinking");
    const result = await buildReveal(toModel(d), forceFallback);
    if (!result.ok) {
      setError("Your plan couldn't load. Try Done or Skip again.");
      setStage(4);
      return;
    }
    if (result.safety && result.safety !== "none") {
      setDraft({
        ...d,
        goalsNote: "",
        dayNote: "",
        wakeNote: "",
        liftsNote: "",
        puttingOff: "",
      });
      setFlag(4);
      setStage(4);
      return;
    }
    if (!result.reveal) {
      setError("Your plan couldn't load. Try Done or Skip again.");
      setStage(4);
      return;
    }
    setReveal(result.reveal);
    setStage("reveal");
  };
  const advance = (from: number) => {
    if (pending || !restored) return;
    setError("");
    const d = hasAnswer(draft, from) ? draft : cleared(draft, from);
    setDraft(d);
    const next: Stage = from === 4 ? "thinking" : ((from + 1) as IntakeStage);
    if (from === 4) setStage("thinking");
    startTransition(async () => {
      try {
        const texts = [d[textKey(from)]].filter((text) => text.trim());
        if (texts.length) {
          const { safety } = await checkIntakeText(texts);
          if (safety !== "none") {
            setDraft({
              ...d,
              [textKey(from)]: "",
            });
            setFlag(next);
            setStage(from as IntakeStage);
            return;
          }
        }
        if (from === 4) await finish(d, !hasAnswer(d, 4));
        else setStage(next);
      } catch {
        setStage(from as IntakeStage);
        setError("Your answer couldn't be checked. Try again.");
      }
    });
  };
  if (flag)
    return (
      <SafetyCheck
        region={region}
        onResume={() => {
          const next = flag;
          setFlag(null);
          if (next === "thinking")
            startTransition(async () => {
              try {
                await finish(draft, true);
              } catch {
                setStage(4);
                setError("Your plan couldn't load. Try Done or Skip again.");
              }
            });
          else setStage(next);
        }}
      />
    );
  if (stage === "intro")
    return (
      <>
        <header className={`page-heading ${styles.intro}`}>
          <h1 ref={heading} tabIndex={-1}>
            Plan your first day
          </h1>
          <p className="lede">
            Start with four short questions. Every question is optional. Your
            draft stays in this tab if you leave.
          </p>
        </header>
        <div className={`actions ${styles.introActions}`}>
          <button
            type="button"
            disabled={!restored}
            onClick={() => setStage(1)}
          >
            Start
          </button>
          <ActionLink href="/today" secondary>
            Skip for now
          </ActionLink>
        </div>
      </>
    );
  if (stage === "thinking")
    return (
      <div className={styles.thinking} role="status">
        <h1 ref={heading} tabIndex={-1}>
          Getting to know you…
        </h1>
        <p className="lede">
          Putting your answers into a first day. This takes a few seconds.
        </p>
      </div>
    );
  if (stage === "reveal" && reveal)
    return (
      <RevealScreen
        reveal={reveal}
        region={region}
        publicKey={publicKey}
        hour12={hour12}
        owner={owner}
        interview={week}
        onWeekChange={(draft) =>
          setWeek((w) => (w && draft ? { ...w, draft } : undefined))
        }
        onBackToWeek={week ? () => setStage("interview") : undefined}
      />
    );
  if (stage === "interview")
    return (
      <WorkInterview
        owner={owner ?? "legacy"}
        region={region}
        intake={toModel(draft)}
        seed={draft.puttingOff}
        onReady={async (token, proposed) => {
          setWeek({ token, draft: proposed });
          await finish(draft);
        }}
        onSkip={async () => {
          setWeek(undefined);
          await finish(draft, true);
        }}
      />
    );
  if (typeof stage !== "number") return null;
  const key = textKey(stage);
  const value =
    stage === 1
      ? draft.goals
      : stage === 2
        ? draft.days
        : stage === 3
          ? draft.lifts
          : [];
  return (
    <form
      className={styles.chatIntake}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        advance(stage);
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          event.target instanceof HTMLTextAreaElement
        ) {
          event.preventDefault();
          advance(stage);
        }
      }}
    >
      <header className="page-heading">
        <p className="eyebrow">{stage} of 4</p>
        <h1 ref={heading} tabIndex={-1}>
          {titles[stage]}
        </h1>
      </header>
      <AskCard
        key={stage}
        ask={asks[stage]}
        label={titles[stage]}
        labelHidden
        value={value}
        other={draft[key]}
        onChange={(v) => {
          if (stage === 1) set("goals", v as IntakeDraft["goals"]);
          if (stage === 2) set("days", v as IntakeDraft["days"]);
          if (stage === 3) set("lifts", v as IntakeDraft["lifts"]);
        }}
        onOtherChange={(v) => set(key, v.slice(0, 200))}
        maxSelections={stage === 1 ? 2 : undefined}
        maxLength={200}
        disabled={pending}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="submit"
          className="secondary"
          disabled={pending || !restored}
        >
          {!hasAnswer(draft, stage) ? "Skip" : stage === 4 ? "Done" : "Next"}
        </button>
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={() => {
            setError("");
            setStage(stage === 1 ? "intro" : ((stage - 1) as IntakeStage));
          }}
        >
          Back
        </button>
      </div>
      <p className="meta">
        <Link href="/today">Leave for Today</Link>
      </p>
    </form>
  );
}
