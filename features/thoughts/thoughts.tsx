"use client";

import { CoachingPaused } from "@/components/coaching-paused";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
  Field,
  Notice,
  PageHeading,
  focusFirstInvalid,
} from "@/components/ui";
import { prepareReflectionStep, thoughtInput } from "@/domain/reflection";
import { hasPlannerDraft } from "@/domain/state";
import { tone } from "@/domain/tone";
import { MemoryApproval } from "@/features/memory/approval";
import styles from "./thoughts.module.css";

const prompts = [
  {
    key: "situation",
    label: "Situation (optional)",
    title: "What happened around you?",
    hint: "A few concrete words are enough. You can skip any prompt.",
  },
  {
    key: "thought",
    label: "Thought (optional)",
    title: "What words came to mind?",
    hint: "Record your own words. This app does not decide whether they are true.",
  },
  {
    key: "feeling",
    label: "Feeling (optional)",
    title: "Anything you want to name?",
    hint: "A word, a description, or no answer. Nothing is inferred from silence.",
  },
  {
    key: "alternative",
    label: "Another perspective (optional)",
    title: "Is there another angle you want to keep?",
    hint: "You do not need a positive version. Practical hardship can remain hard, and this can stay blank.",
  },
] as const;

export function Thoughts() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [stage, setStage] = useDraft("thoughts.stage", "0");
  const [situation, setSituation] = useDraft("thoughts.situation");
  const [thought, setThought] = useDraft("thoughts.thought");
  const [feeling, setFeeling] = useDraft("thoughts.feeling");
  const [alternative, setAlternative] = useDraft("thoughts.alternative");
  const [savedAt, setSavedAt] = useDraft("thoughts.savedAt");
  const [step, setStep] = useDraft("thoughts.step");
  const [stepError, setStepError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const promptRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLElement>(null);
  const index = Math.max(0, Math.min(3, Number(stage) || 0));
  const prompt = prompts[index];
  const values = { situation, thought, feeling, alternative };
  const setters = {
    situation: setSituation,
    thought: setThought,
    feeling: setFeeling,
    alternative: setAlternative,
  };
  const plannerDraftExists = hasPlannerDraft(state);

  function finish() {
    const result = thoughtInput.safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues)
        next[String(issue.path[0])] = issue.message;
      setErrors(next);
      const first = prompts.findIndex((item) => next[item.key]);
      if (first >= 0) setStage(String(first));
      focusFirstInvalid(promptRef.current);
      return;
    }
    setErrors({});
    setSavedAt(state.clock);
    requestAnimationFrame(() =>
      document.getElementById("thoughts-saved")?.focus(),
    );
  }

  if (state.scenario === "coaching paused")
    return (
      <CoachingPaused
        eyebrow="Thought reflection · review scenario"
        note="Your draft stays in this session."
      />
    );

  return (
    <>
      <PageHeading
        eyebrow={"Reflect · optional prompt " + (index + 1) + " of 4"}
        description={
          tone(state.appearance.tone, "reflection", state.energy).message
        }
      >
        {prompt.title}
      </PageHeading>
      <div className={styles.document}>
        <div ref={promptRef}>
          <Field
            label={prompt.label}
            value={values[prompt.key]}
            onChange={setters[prompt.key]}
            multiline
            maxLength={1000}
            error={errors[prompt.key]}
            hint={prompt.hint}
          />
        </div>
        <div className="actions">
          {index > 0 && (
            <button
              className="secondary"
              onClick={() => setStage(String(index - 1))}
            >
              Previous prompt
            </button>
          )}
          {index < 3 && (
            <>
              <button onClick={() => setStage(String(index + 1))}>
                Next prompt
              </button>
              <button
                className="text"
                onClick={() => setStage(String(index + 1))}
              >
                Skip this prompt
              </button>
            </>
          )}
          {index === 3 && <button onClick={finish}>Finish reflection</button>}
          <ActionLink href="/reflect" secondary>
            {index === 3 ? "Leave without finishing" : "Keep draft & leave"}
          </ActionLink>
        </div>
        {savedAt && (
          <Notice id="thoughts-saved">
            {tone(state.appearance.tone, "reflected", state.energy).message}{" "}
            Reflection finished at {savedAt.slice(0, 16).replace("T", " ")}{" "}
            virtual time. Your words stay in this session only and nothing has
            been added to memory. You can stop here.
          </Notice>
        )}
        <details className={styles.notes} open={index === 3}>
          <summary>Your words so far</summary>
          <dl>
            {prompts.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{values[item.key] || "Left blank"}</dd>
              </div>
            ))}
          </dl>
        </details>
        {index === 3 && (
          <section className={styles.next} ref={stepRef}>
            <h2>Any next step is optional.</h2>
            <p>
              A safe, ordinary action can go to the planner for you to review
              and choose. Leaving it blank does not add a plan.
            </p>
            <Field
              label="An optional step in your words"
              value={step}
              onChange={setStep}
              maxLength={240}
              error={stepError}
            />
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  const result = prepareReflectionStep(
                    state,
                    step,
                    "Everyday care",
                  );
                  if (!result.ok) {
                    setStepError(result.error);
                    focusFirstInvalid(stepRef.current);
                    return;
                  }
                  for (const action of result.actions) dispatch(action);
                  setStepError("");
                  router.push("/steps/new");
                }}
              >
                Bring this step to planner
              </button>
              {plannerDraftExists && (
                <ActionLink href="/steps/new" secondary>
                  Inspect existing planner draft
                </ActionLink>
              )}
            </div>
            <MemoryApproval
              prefix="thoughts.memory"
              source="Thought reflection: explicit wording"
            />
          </section>
        )}
        <div className="actions">
          <button
            className="text"
            onClick={() => {
              dispatch({ type: "clearDraft", prefix: "thoughts." });
              setErrors({});
              setStepError("");
            }}
          >
            Discard reflection draft
          </button>
          <ActionLink href="/settings/memory" secondary>
            Approved memory
          </ActionLink>
        </div>
      </div>
    </>
  );
}
