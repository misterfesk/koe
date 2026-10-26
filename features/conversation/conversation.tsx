"use client";

import { CoachingPaused } from "@/components/coaching-paused";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
  Field,
  Notice,
  PageHeading,
  focusFirstInvalid,
  ConfirmDelete,
} from "@/components/ui";
import {
  conversationOption,
  conversationWords,
  prepareConversationStep,
} from "@/domain/reflection";
import { canRetrieveMemory } from "@/domain/state";
import { tone } from "@/domain/tone";
import { REVIEW_ENABLED } from "@/fixtures/review";
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
  const voice = tone(state.appearance.tone, "conversation", state.energy);
  const ideaMemory = state.memories.find(
    (memory) => memory.id === option?.sourceMemoryId,
  );
  const exchangeRef = useRef<HTMLDivElement>(null);
  const shownStage = useRef(stage);
  useEffect(() => {
    // Move focus to the new content when the stage changes, not on first render.
    if (shownStage.current === stage) return;
    shownStage.current = stage;
    exchangeRef.current?.focus();
  }, [stage]);

  function continueScript(event: FormEvent) {
    event.preventDefault();
    const parsed = conversationWords.safeParse(words);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      focusFirstInvalid(event);
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
      focusFirstInvalid(event);
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
    return <CoachingPaused eyebrow="Scripted conversation · review scenario" />;

  if (!state.providerEnabled)
    return (
      <>
        <PageHeading
          eyebrow="Scripted conversation · offline"
          description="Your draft is kept. Help & support works without the script."
        >
          This preview is offline.
        </PageHeading>
        <p>
          Turning it back on runs the local script only. There is no live AI.
        </p>
        <div className="actions">
          <button onClick={() => dispatch({ type: "provider", value: true })}>
            Turn the script back on
          </button>
          <ActionLink href="/help" secondary>
            Help & support
          </ActionLink>
          <ActionLink href="/reflect" secondary>
            Keep draft & leave
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
            ? "The script stopped."
            : "Talk it through"}
      </PageHeading>
      <p className="notice">
        <strong>
          Scripted preview. No live AI reads or responds to your words.
        </strong>
      </p>
      <div className={styles.exchange} ref={exchangeRef} tabIndex={-1}>
        {stage === "intro" ? (
          <section className={styles.intro}>
            <p>
              It runs the same way whatever you write, and it doesn&apos;t
              assess or interpret your words.
            </p>
            <p>
              You decide whether to see a suggestion, keep a memory card, or
              stop.
            </p>
            <div className="actions">
              <button onClick={() => setStage("talk")}>Start</button>
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
              label="Your words"
              value={words}
              onChange={setWords}
              multiline
              maxLength={1000}
              error={error}
            />
            <div className="actions">
              <button>Continue the script</button>
              {REVIEW_ENABLED && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setError("");
                    setStage("error");
                  }}
                >
                  Preview an error (review)
                </button>
              )}
              <button
                className="text"
                type="button"
                onClick={() => {
                  setConsent("no");
                  setStage("cancelled");
                }}
              >
                Stop here
              </button>
            </div>
          </form>
        ) : stage === "error" ? (
          <section>
            <Notice>
              Error preview: the script stopped. Your draft is kept, and nothing
              was sent or processed.
            </Notice>
            <div className="actions">
              <button
                onClick={() => {
                  setConsent("no");
                  setStage("talk");
                }}
              >
                Try again
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setConsent("no");
                  setStage("cancelled");
                }}
              >
                Stop here
              </button>
              <ActionLink href="/help" secondary>
                Help & support
              </ActionLink>
            </div>
          </section>
        ) : stage === "cancelled" || stage === "closed" ? (
          <section>
            <p>
              Nothing was added to your steps. Your draft is kept until you
              discard it.
            </p>
            <div className="actions">
              <button className="secondary" onClick={() => setStage("talk")}>
                Pick up where you left off
              </button>
              <ActionLink href="/reflect" secondary>
                Back to Reflect
              </ActionLink>
              <ConfirmDelete
                label="Discard draft"
                question="Discard this conversation draft?"
                detail="This deletes your conversation words and step draft. Chosen steps and memory cards stay."
                onConfirm={() => {
                  dispatch({ type: "clearDraft", prefix: "conversation." });
                  setError("");
                }}
              />
            </div>
            <MemoryApproval
              prefix="conversation.memory"
              source="Scripted conversation: explicit wording"
            />
          </section>
        ) : (
          <section>
            <div className={styles.userWords}>
              <p className="eyebrow">You wrote</p>
              <p>{lastWords || "You didn't add any words."}</p>
            </div>
            <div className={styles.fixture}>
              <p className="eyebrow">
                Fixed script · the same response for every input
              </p>
              <p>
                No need to put a positive spin on it. You can leave this here,
                or choose one ordinary next step.
              </p>
            </div>
            {stage === "permission" ? (
              <>
                <h2>Would a suggestion help?</h2>
                <p>Nothing goes on Today unless you choose it.</p>
                <div className="actions">
                  <button
                    onClick={() => {
                      // A resumed conversation retains both the edited words and their provenance.
                      if (state.drafts["conversation.step"] === undefined) {
                        const shown = conversationOption(state, true);
                        setStep(shown?.title ?? "");
                        setSourceMemoryId(shown?.sourceMemoryId ?? "");
                      }
                      setConsent("yes");
                      setStage("suggestion");
                    }}
                  >
                    Yes, show a suggestion
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setConsent("no");
                      setStage("closed");
                    }}
                  >
                    No, stop here
                  </button>
                  {REVIEW_ENABLED && (
                    <button className="text" onClick={() => setStage("error")}>
                      Preview an error (review)
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2>A suggestion</h2>
                <p
                  data-testid="current-script-idea"
                  className={styles.currentIdea}
                >
                  {idea ?? "No suggestion without your permission."}
                </p>
                <p className="hint" data-testid="idea-provenance">
                  {ideaMemory
                    ? "Based on your memory card “" +
                      ideaMemory.text +
                      "”. Delete the card and suggestions stop using it."
                    : "A fixed example from the script. It doesn't use your memory cards."}
                </p>
                {!chosen && idea && step !== idea && (
                  <p className="hint">
                    Your edited version below is kept unless you replace it.
                  </p>
                )}
                {chosen ? (
                  <div className="panel">
                    <p>
                      It&apos;s on Today. You can say how it went after you try
                      it.
                    </p>
                    <ActionLink href={"/steps/" + chosen.id} secondary>
                      Open step
                    </ActionLink>
                  </div>
                ) : (
                  <form onSubmit={chooseStep} noValidate>
                    <Field
                      label="Your step"
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
                      <ConfirmDelete
                        label="Use the suggestion as written"
                        question="Replace this step draft?"
                        detail="This replaces your edited step. Your conversation words stay."
                        onConfirm={() => {
                          if (option) {
                            setStep(option.title);
                            setSourceMemoryId(option.sourceMemoryId ?? "");
                            setError("");
                          }
                        }}
                      />
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
                    See Memory
                  </ActionLink>
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
    </>
  );
}
