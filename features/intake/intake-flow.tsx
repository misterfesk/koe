"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionLink, Field } from "@/components/ui";
import {
  busiestLabels,
  busiestTimes,
  dayKinds,
  dayLabels,
  goalLabels,
  goals,
  liftLabels,
  lifts,
  morningPlans,
  peopleKinds,
  peopleLabels,
  supportLabels,
  supports,
  toneChoices,
  wakeLabels,
  wakes,
  type Busiest,
  type DayKind,
  type Goal,
  type IntakeInput,
  type IntroTone,
  type Lift,
  type MorningPlan,
  type PeopleKind,
  type Reveal as RevealData,
  type Support,
  type Wake,
} from "@/domain/intake";
import type { RiskLevel } from "@/domain/safety";
import { buildReveal, checkIntakeText } from "@/server/actions/intake";
import { SafetyCheck } from "../safety/safety-check";
import { loadDraft, saveDraft, storable } from "./draft-store";
import { ChipGroup } from "./parts";
import { RevealScreen } from "./reveal";
import styles from "./intake.module.css";

type Draft = {
  goals: Goal[];
  goalsNote: string;
  wake: Wake[];
  days: DayKind[];
  busiest: Busiest[];
  puttingOff: string;
  dayNote: string;
  lifts: Lift[];
  liftsNote: string;
  people: PeopleKind[];
  names: { name: string; save: boolean }[];
  support: Support[];
  peopleNote: string;
  tone: IntroTone[];
  morningPlan: MorningPlan[];
};

const blank: Draft = {
  goals: [],
  goalsNote: "",
  wake: [],
  days: [],
  busiest: [],
  puttingOff: "",
  dayNote: "",
  lifts: [],
  liftsNote: "",
  people: [],
  names: [{ name: "", save: false }],
  support: [],
  peopleNote: "",
  tone: [],
  morningPlan: [],
};

function toModel(d: Draft): IntakeInput {
  const names = d.people.some((p) => p !== "nobody")
    ? d.names.filter((n) => n.name.trim())
    : [];
  return {
    goals: d.goals,
    wake: d.wake[0],
    days: d.days[0],
    busiest: d.busiest[0],
    puttingOff: d.puttingOff,
    lifts: d.lifts,
    people: d.people,
    names,
    support: d.support[0],
    tone: d.tone[0],
    morningPlan: d.morningPlan[0],
    notes: {
      goals: d.goalsNote,
      day: d.dayNote,
      lifts: d.liftsNote,
      people: d.peopleNote,
    },
  };
}

/** The free text on each question, for the safety check. */
const textsOf = (d: Draft, q: number): string[] =>
  (q === 1
    ? [d.goalsNote]
    : q === 2
      ? [d.puttingOff, d.dayNote]
      : q === 3
        ? [d.liftsNote]
        : q === 4
          ? [...d.names.map((n) => n.name), d.peopleNote]
          : []
  ).filter((t) => t.trim());

/** What skipping a question, or a safety hit on it, leaves behind. */
function cleared(d: Draft, q: number): Draft {
  if (q === 1) return { ...d, goals: [], goalsNote: "" };
  if (q === 2)
    return {
      ...d,
      wake: [],
      days: [],
      busiest: [],
      puttingOff: "",
      dayNote: "",
    };
  if (q === 3) return { ...d, lifts: [], liftsNote: "" };
  if (q === 4)
    return {
      ...d,
      people: [],
      support: [],
      names: [{ name: "", save: false }],
      peopleNote: "",
    };
  return { ...d, tone: [], morningPlan: [] };
}

/** Only the typed words go, so a safety hit keeps the person's ticks. */
function withoutWords(d: Draft, q: number): Draft {
  if (q === 1) return { ...d, goalsNote: "" };
  if (q === 2) return { ...d, puttingOff: "", dayNote: "" };
  if (q === 3) return { ...d, liftsNote: "" };
  if (q === 4)
    return { ...d, names: [{ name: "", save: false }], peopleNote: "" };
  return d;
}

const TOTAL = 5;
const toOptions = <T extends string>(
  list: readonly T[],
  labels: Record<T, string>,
) => list.map((v) => ({ value: v, label: labels[v] }));

type Stage = "intro" | 1 | 2 | 3 | 4 | 5 | "thinking" | "reveal";

const titles: Record<number, string> = {
  1: "What would help most right now?",
  2: "What does a usual day look like?",
  3: "What used to lift you a little, even slightly?",
  4: "Who's in your corner?",
  5: "How should Koe be with you?",
};

export function IntakeFlow({
  region,
  publicKey,
}: {
  region: string | null;
  publicKey: string | null;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [draft, setDraft] = useState<Draft>(blank);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [flag, setFlag] = useState<Stage | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // A reload picks up where the person was (sessionStorage, nothing risky kept).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadDraft<Draft>();
    // Storage is only readable in the browser, so it is read after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) {
      setDraft({ ...blank, ...saved.draft });
      setStage(saved.stage);
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!restored) return;
    // The reveal and the wait before it resume at the last question.
    const at: Stage = stage === "thinking" || stage === "reveal" ? 5 : stage;
    saveDraft({
      stage: at as 1 | 2 | 3 | 4 | 5 | "intro",
      draft: storable(draft),
    });
  }, [restored, stage, draft]);

  // Each new screen starts at its heading, for keyboard and screen reader users.
  useEffect(() => {
    heading.current?.focus();
  }, [stage, flag]);

  const finish = async (d: Draft) => {
    setStage("thinking");
    const r = await buildReveal(toModel(d));
    if (!r.ok) {
      setError(Object.values(r.errors)[0] ?? "Something went wrong.");
      setStage(5);
      return;
    }
    if (r.safety && r.safety !== "none") {
      // Not expected after the per-question checks, but handled the same way.
      setFlag(5);
      setStage(5);
      return;
    }
    setReveal(r.reveal);
    setStage("reveal");
  };

  /** Moves on from a question, after checking the words typed on it. */
  const advance = (from: number, skipped = false) => {
    setError("");
    const d = skipped ? cleared(draft, from) : draft;
    if (skipped) setDraft(d);
    const next: Stage = from === TOTAL ? "thinking" : ((from + 1) as Stage);
    const texts = textsOf(d, from);
    startTransition(async () => {
      if (texts.length) {
        const { safety }: { safety: RiskLevel } = await checkIntakeText(texts);
        if (safety !== "none") {
          // The words stay out of the plan; the fixed safety flow comes first.
          setDraft(withoutWords(d, from));
          setFlag(next);
          return;
        }
      }
      if (from === TOTAL) return finish(d);
      setStage(next);
    });
  };

  if (flag)
    return (
      <SafetyCheck
        region={region}
        onResume={() => {
          const next = flag;
          setFlag(null);
          if (next === "thinking") startTransition(() => finish(draft));
          else setStage(next);
        }}
      />
    );

  if (stage === "intro")
    return (
      <>
        <header className="page-heading">
          <p className="eyebrow">Welcome</p>
          <h1 ref={heading} tabIndex={-1}>
            Let&apos;s get to know you
          </h1>
          <p className="lede">
            Five quick questions so Koe can plan a day that fits you. Tap an
            answer or add a few words. Every question is optional, and nothing
            is saved until you say so.
          </p>
        </header>
        <div className="actions">
          <button type="button" onClick={() => setStage(1)}>
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
          Putting your answers together into a first day. This takes a few
          seconds.
        </p>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    );

  if (stage === "reveal" && reveal)
    return (
      <RevealScreen reveal={reveal} region={region} publicKey={publicKey} />
    );

  if (typeof stage !== "number") return null;
  const question = stage;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        advance(question);
      }}
      noValidate
    >
      <header className="page-heading">
        <p className={`eyebrow ${styles.progress}`}>
          {question} of {TOTAL}
        </p>
        <div className={styles.bar} aria-hidden="true">
          <span
            className={styles.barFill}
            style={{ width: `${(question / TOTAL) * 100}%` }}
          />
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {titles[question]}
        </h1>
      </header>

      {question === 1 && (
        <>
          <ChipGroup
            legend="Pick up to 2"
            options={toOptions(goals, goalLabels)}
            value={draft.goals}
            onChange={(v) => set("goals", v)}
            multiple
            max={2}
          />
          <Field
            label="Add a few words (optional)"
            value={draft.goalsNote}
            onChange={(v) => set("goalsNote", v)}
            maxLength={200}
          />
        </>
      )}

      {question === 2 && (
        <>
          <ChipGroup
            legend="When do you usually wake up?"
            options={toOptions(wakes, wakeLabels)}
            value={draft.wake}
            onChange={(v) => set("wake", v)}
          />
          <ChipGroup
            legend="What fills most of your days?"
            options={toOptions(dayKinds, dayLabels)}
            value={draft.days}
            onChange={(v) => set("days", v)}
          />
          <ChipGroup
            legend="When is it busiest?"
            options={toOptions(busiestTimes, busiestLabels)}
            value={draft.busiest}
            onChange={(v) => set("busiest", v)}
          />
          <Field
            label="Is there one thing you keep putting off? (optional)"
            value={draft.puttingOff}
            onChange={(v) => set("puttingOff", v)}
            maxLength={200}
          />
          <Field
            label="Add a few words (optional)"
            value={draft.dayNote}
            onChange={(v) => set("dayNote", v)}
            maxLength={200}
          />
        </>
      )}

      {question === 3 && (
        <>
          <ChipGroup
            legend="Pick any that fit"
            options={toOptions(lifts, liftLabels)}
            value={draft.lifts}
            onChange={(v) => set("lifts", v)}
            multiple
          />
          <Field
            label="Add a few words (optional)"
            value={draft.liftsNote}
            onChange={(v) => set("liftsNote", v)}
            maxLength={200}
          />
        </>
      )}

      {question === 4 && (
        <>
          <ChipGroup
            legend="Pick any that fit"
            options={toOptions(peopleKinds, peopleLabels)}
            value={draft.people}
            onChange={(v) => set("people", v)}
            multiple
            exclusive="nobody"
          />
          {draft.people.some((p) => p !== "nobody") && (
            <div className={styles.group}>
              <p className="hint">
                Names are optional. Koe only adds a name to your people if you
                tick the box.
              </p>
              {draft.names.map((n, i) => (
                <div key={i} className={styles.nameRow}>
                  <Field
                    label={`Name ${i + 1} (optional)`}
                    value={n.name}
                    onChange={(v) =>
                      set(
                        "names",
                        draft.names.map((x, j) =>
                          j === i ? { ...x, name: v } : x,
                        ),
                      )
                    }
                    maxLength={40}
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={n.save}
                      onChange={(e) =>
                        set(
                          "names",
                          draft.names.map((x, j) =>
                            j === i ? { ...x, save: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span>
                      Save {n.name.trim() || "this name"} to my people
                    </span>
                  </label>
                </div>
              ))}
              {draft.names.length < 3 && (
                <button
                  type="button"
                  className="text"
                  onClick={() =>
                    set("names", [...draft.names, { name: "", save: false }])
                  }
                >
                  Add another name
                </button>
              )}
            </div>
          )}
          <ChipGroup
            legend="Is a therapist or doctor helping you?"
            options={toOptions(supports, supportLabels)}
            value={draft.support}
            onChange={(v) => set("support", v)}
          />
          <Field
            label="Add a few words (optional)"
            value={draft.peopleNote}
            onChange={(v) => set("peopleNote", v)}
            maxLength={200}
          />
        </>
      )}

      {question === 5 && (
        <>
          <ChipGroup
            legend="Koe's tone"
            hint="Gentle is quiet and unhurried. Upbeat is warm and encouraging. Straight-talking is short and plain."
            options={toneChoices.map((t) => ({
              value: t.value,
              label: t.label,
            }))}
            value={draft.tone}
            onChange={(v) => set("tone", v)}
          />
          <ChipGroup
            legend="A morning plan time"
            hint="This only picks a time. A reminder stays off until you turn it on."
            options={morningPlans.map((m) => ({
              value: m,
              label: m === "none" ? "Not now" : m,
            }))}
            value={draft.morningPlan}
            onChange={(v) => set("morningPlan", v)}
          />
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {question === TOTAL ? "Finish" : "Next"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => advance(question, true)}
        >
          Skip
        </button>
        <button
          type="button"
          className="text"
          disabled={pending}
          onClick={() =>
            setStage(question === 1 ? "intro" : ((question - 1) as Stage))
          }
        >
          Back
        </button>
      </div>
      <p className="meta">
        Prefer to wait? <Link href="/today">Skip the rest for now</Link>.
      </p>
    </form>
  );
}
