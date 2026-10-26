"use client";
import { useState, type FormEvent } from "react";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Select,
  Notice,
  ActionLink,
  ConfirmDelete,
  focusFirstInvalid,
} from "@/components/ui";
import { contactMessage, contactContext } from "@/domain/connect";
import { copyText } from "@/services/export";
import { tone } from "@/domain/tone";
export function ReachOut() {
  const { state, dispatch } = useSession();
  const [person, setPerson] = useDraft("connect.person", "");
  const [message, setMessage] = useDraft(
    "connect.message",
    "Hi Alex, would you be up for a short chat sometime? No pressure to reply straight away.",
  );
  const [outcome, setOutcome] = useDraft("connect.outcome");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [outcomeError, setOutcomeError] = useState("");
  const voice = tone(
    state.appearance.tone,
    person === "none" || person === "community"
      ? "reflection"
      : contactContext(state.contactOutcome),
    state.energy,
  );
  async function copy(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    const result = contactMessage.safeParse(message);
    if (!result.success) {
      setError(result.error.issues[0].message);
      focusFirstInvalid(e);
      return;
    }
    setError("");
    try {
      await copyText(result.data);
      setStatus("Copied. Nothing was sent.");
    } catch {
      setStatus(
        "Clipboard unavailable. Select and copy the draft manually. Nothing was sent.",
      );
    }
  }
  function record(e: FormEvent) {
    e.preventDefault();
    if (!["Connected", "No reply", "Prefer not to say"].includes(outcome)) {
      setOutcomeError("Choose how it went, or leave it unknown.");
      focusFirstInvalid(e);
      return;
    }
    setOutcomeError("");
    dispatch({ type: "contactOutcome", value: outcome });
    setOutcome("");
    setStatus("");
  }
  return (
    <>
      <PageHeading
        eyebrow="Connect"
        description="Choose someone you consider safe, or explore support options."
      >
        Reach out
      </PageHeading>
      <div className="prose">
        <Select
          label="Who feels safe to contact?"
          value={person}
          onChange={(value) => {
            setPerson(value);
            setStatus("");
            setError("");
            setOutcome("");
          }}
          options={[
            { value: "", label: "Choose an option" },
            { value: "person", label: "Someone I consider safe" },
            { value: "community", label: "A community or support option" },
            { value: "none", label: "No safe person right now" },
          ]}
        />
        {person === "person" ? (
          <>
            <form onSubmit={copy}>
              <p className="hint">
                Copy a draft to use elsewhere. Koe cannot send it.
              </p>
              <Field
                label="Your message"
                value={message}
                onChange={(value) => {
                  setMessage(value);
                  setStatus("");
                }}
                multiline
                maxLength={1000}
                error={error}
              />
              <button>Copy message</button>
            </form>
            {status && <Notice>{status}</Notice>}
            <hr className="divider" />
            <details>
              <summary>After you reach out</summary>
              <h2>How did it go?</h2>
              <p className="hint">
                Every question is optional. No reply stays unknown until you
                report it.
              </p>
              <form onSubmit={record}>
                <Select
                  label="How did it go?"
                  value={outcome}
                  onChange={setOutcome}
                  error={outcomeError}
                  options={[
                    { value: "", label: "Unknown / no report" },
                    ...["Connected", "No reply", "Prefer not to say"].map(
                      (x) => ({ value: x, label: x }),
                    ),
                  ]}
                />
                <button className="secondary">Save how it went</button>
              </form>
            </details>
          </>
        ) : person ? (
          <section className="panel">
            <h2>You can leave it here</h2>
            <p>
              You can choose a verified support option, look for local community
              support in your own time, or stop here.
            </p>
            <ActionLink href="/help" secondary>
              Support options →
            </ActionLink>
          </section>
        ) : (
          <p>
            There is no right choice here. You can leave without contacting
            anyone.
          </p>
        )}
        {state.contactOutcome && (
          <section className="panel" style={{ marginTop: 28 }}>
            <p className="eyebrow">You reported</p>
            <h2>{state.contactOutcome}</h2>
            {state.contactOutcome === "No reply" ? (
              <>
                <p>No reply does not tell you why.</p>
                <p>
                  You do not have to chase an answer. A different safe person,
                  support service or a break are all options.
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setPerson("none");
                      setStatus("");
                      dispatch({
                        type: "draft",
                        key: "connect.approach",
                        value: "Support options or a break",
                      });
                    }}
                  >
                    Try another approach
                  </button>
                  <ActionLink href="/today" secondary>
                    Leave it here
                  </ActionLink>
                </div>
              </>
            ) : (
              <p>{voice.message}</p>
            )}
          </section>
        )}
        <div className="actions">
          {person === "person" && (
            <ConfirmDelete
              label="Discard message draft"
              question="Discard this message draft?"
              detail="Your report stays."
              onConfirm={() => {
                setMessage("");
                setError("");
                setStatus("Message draft discarded.");
              }}
            />
          )}
          <ActionLink href="/connect/care" secondary>
            Prepare for care →
          </ActionLink>
          <ActionLink href="/today" secondary>
            Back to Today →
          </ActionLink>
        </div>
      </div>
    </>
  );
}
