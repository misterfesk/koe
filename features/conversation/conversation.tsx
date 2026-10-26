"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useDraft, useSession } from "@/components/session";
import { ActionLink, Field, Notice, PageHeading } from "@/components/ui";
import {
  conversationOption,
  conversationWords,
  prepareConversationStep,
} from "@/domain/reflection";
import { canRetrieveMemory } from "@/domain/state";
import { tone } from "@/domain/tone";
import { MemoryApproval } from "@/features/memory/approval";
import styles from "./conversation.module.css";

export function Conversation() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [stage, setStage] = useDraft("conversation.stage", "intro");
  const [words, setWords] = useDraft("conversation.words");
  const [lastWords, setLastWords] = useDraft("conversation.lastWords");
  const [consent, setConsent] = useDraft("conversation.consent", "no");
  const [chosenId, setChosenId] = useDraft("conversation.chosenId");
  const option = conversationOption(state, consent === "yes");
  const idea = option?.title ?? null;
  const [step, setStep] = useDraft("conversation.step", idea ?? "");
  const [sourceMemoryId, setSourceMemoryId] = useDraft(
    "conversation.stepSourceMemoryId",
    state.drafts["conversation.step"] !== undefined
      ? ""
      : (option?.sourceMemoryId ?? ""),
  );
  const [error, setError] = useState("");
  const choosing = useRef(false);
  const chosen = state.steps.find((value) => value.id === chosenId);
  const voice = tone(state.appearance.tone, "reflection", state.energy);

  function continueScript(event: FormEvent) {
    event.preventDefault();
    const parsed = conversationWords.safeParse(words);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setError("");
    setLastWords(parsed.data);
    setConsent("no");
    setStage("permission");
  }

  function chooseStep(event: FormEvent) {
    event.preventDefault();
    const result = prepareConversationStep(
      state,
      consent === "yes",
      step,
      sourceMemoryId || undefined,
    );
    if (!result.ok) {
      setError(result.error);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (choosing.current) return;
    choosing.current = true;
    const id = "step-" + (state.sequence + 1);
    dispatch(result.action);
    setChosenId(id);
    setError("");
    router.push("/steps/" + id);
  }

  if (state.scenario === "coaching paused")
    return (
      <>
        <PageHeading eyebrow="Scripted conversation · review scenario">
          Ordinary coaching is paused.
        </PageHeading>
        <Notice>
          UX preview; not a validated safety response. No real input was
          assessed.
        </Notice>
        <ActionLink href="/help">Open Help & support</ActionLink>
      </>
    );

  if (!state.providerEnabled)
    return (
      <>
        <PageHeading
          eyebrow="Scripted conversation · offline preview"
          description="Your session draft remains here. Help works independently of this script."
        >
          This preview is offline.
        </PageHeading>
        <p>
          No live AI is involved. Restoring the preview enables only the local
          script.
        </p>
        <div className="actions">
          <button onClick={() => dispatch({ type: "provider", value: true })}>
            Restore preview
          </button>
          <ActionLink href="/help" secondary>
            Help & support
          </ActionLink>
          <ActionLink href="/reflect" secondary>
            Leave with draft
          </ActionLink>
        </div>
      </>
    );

  return (
    <>
      <PageHeading
        eyebrow="Reflect · scripted conversation"
        description={voice.message}
      >
        {stage === "cancelled" || stage === "closed"
          ? "You can leave it here."
          : stage === "error"
            ? "A pause in the preview."
            : "An exchange with room to pause."}
      </PageHeading>
      <p className="notice">
        <strong>
          Scripted preview. No live AI reads or responds to your words.
        </strong>
      </p>
      <div className={styles.exchange}>
        {stage === "intro" ? (
          <section className={styles.intro}>
            <p>
              A short, fixed exchange to review the interaction. It does not
              assess, interpret or treat what you write. Use fictional words
              only.
            </p>
            <p>
              You decide whether to see an idea, keep a memory card, or leave.
            </p>
            <div className="actions">
              <button onClick={() => setStage("talk")}>Start the script</button>
              <ActionLink href="/reflect" secondary>
                Not now
              </ActionLink>
            </div>
          </section>
        ) : stage === "talk" ? (
          <form onSubmit={continueScript} noValidate>
            <div className={styles.fixture}>
              <p className="eyebrow">Fixed script</p>
              <p>
                You can put a few words here, or leave the space blank. There is
                no need to make this sound positive.
              </p>
            </div>
            <Field
              label="Your fictional words (optional)"
              value={words}
              onChange={setWords}
              multiline
              maxLength={1000}
              error={error}
            />
            <div className="actions">
              <button>Continue scripted exchange</button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setError("");
                  setStage("error");
                }}
              >
                Preview interruption
              </button>
              <button
                className="text"
                type="button"
                onClick={() => {
                  setConsent("no");
                  setStage("cancelled");
                }}
              >
                Cancel exchange
              </button>
            </div>
          </form>
        ) : stage === "error" ? (
          <section>
            <Notice>
              Error-state preview. The script was interrupted; your draft is
              still in this session. Nothing was sent or processed.
            </Notice>
            <div className="actions">
              <button
                onClick={() => {
                  setConsent("no");
                  setStage("talk");
                }}
              >
                Retry the script
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setConsent("no");
                  setStage("cancelled");
                }}
              >
                Cancel exchange
              </button>
              <ActionLink href="/help" secondary>
                Help & support
              </ActionLink>
            </div>
          </section>
        ) : stage === "cancelled" || stage === "closed" ? (
          <section>
            <p>
              No action or reminder is required. Your draft stays here unless
              you discard it or reset the session.
            </p>
            <div className="actions">
              <button className="secondary" onClick={() => setStage("talk")}>
                Resume the script
              </button>
              <ActionLink href="/reflect" secondary>
                Back to Reflect
              </ActionLink>
              <button
                className="text"
                onClick={() => {
                  dispatch({ type: "clearDraft", prefix: "conversation." });
                  setError("");
                }}
              >
                Discard conversation draft
              </button>
            </div>
            <MemoryApproval
              prefix="conversation.memory"
              source="Scripted conversation: explicit wording"
            />
          </section>
        ) : (
          <section>
            <div className={styles.userWords}>
              <p className="eyebrow">Your fictional words</p>
              <p>{lastWords || "You chose not to add words."}</p>
            </div>
            <div className={styles.fixture}>
              <p className="eyebrow">
                Fixed script · the same response for every input
              </p>
              <p>
                No need to put a positive spin on it. We can leave this here, or
                choose one ordinary next step.
              </p>
            </div>
            {stage === "permission" ? (
              <>
                <h2>Would an idea be useful?</h2>
                <p>Nothing is added to your plan unless you choose it.</p>
                <div className="actions">
                  <button
                    onClick={() => {
                      setConsent("yes");
                      setStage("suggestion");
                    }}
                  >
                    Yes, show an idea
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setConsent("no");
                      setStage("closed");
                    }}
                  >
                    No, leave it here
                  </button>
                  <button className="text" onClick={() => setStage("error")}>
                    Preview interruption
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>One optional idea.</h2>
                <p
                  data-testid="current-script-idea"
                  className={styles.currentIdea}
                >
                  {idea ?? "No idea is available without your permission."}
                </p>
                <p className="hint">
                  This is a fresh fixture idea. Approved memory is used only
                  while permission is on and temporary mode is off. An edited
                  step draft below remains your own wording.
                </p>
                {chosen ? (
                  <div className="panel">
                    <p>
                      Your chosen step is in the plan. Choosing is not reporting
                      it complete.
                    </p>
                    <ActionLink href={"/steps/" + chosen.id} secondary>
                      Open chosen step
                    </ActionLink>
                  </div>
                ) : (
                  <form onSubmit={chooseStep} noValidate>
                    <Field
                      label="Step idea (editable)"
                      value={step}
                      onChange={(value) => {
                        setStep(value);
                        if (!state.drafts["conversation.step"])
                          setSourceMemoryId(option?.sourceMemoryId ?? "");
                        else if (
                          sourceMemoryId &&
                          !canRetrieveMemory(state, sourceMemoryId)
                        )
                          setSourceMemoryId("");
                      }}
                      multiline
                      maxLength={240}
                      error={error}
                    />
                    <div className="actions">
                      <button disabled={!idea}>Choose this step</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          if (option) {
                            setStep(option.title);
                            setSourceMemoryId(option.sourceMemoryId ?? "");
                            setError("");
                          }
                        }}
                      >
                        Use current idea
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setConsent("no");
                          setStage("closed");
                        }}
                      >
                        Not now
                      </button>
                    </div>
                  </form>
                )}
                <div className="actions">
                  <ActionLink href="/settings/memory" secondary>
                    Inspect approved memory
                  </ActionLink>
                  <button
                    className="text"
                    onClick={() => {
                      setConsent("no");
                      setStage("cancelled");
                    }}
                  >
                    Cancel exchange
                  </button>
                </div>
                <MemoryApproval
                  prefix="conversation.memory"
                  source="Scripted conversation: explicit wording"
                />
              </>
            )}
          </section>
        )}
      </div>
      <div className="actions">
        <ActionLink href="/reflect/thoughts" secondary>
          Thought reflection
        </ActionLink>
        <ActionLink href="/reflect/journal" secondary>
          Energy & journal
        </ActionLink>
        <ActionLink href="/settings/memory" secondary>
          Approved memory
        </ActionLink>
      </div>
    </>
  );
}
