"use client";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Select,
  Field,
  Notice,
  ActionLink,
} from "@/components/ui";
import { helpResources, regionOptions } from "@/fixtures/help-resources";
import { copyText } from "@/services/export";
import { tone } from "@/domain/tone";
const languages: Record<string, string> = {
  JP: "ja",
  KR: "ko",
  IN: "hi",
  LT: "lt",
  PL: "pl",
};
export function Help() {
  const { state, dispatch } = useSession();
  const [message, setMessage] = useDraft(
    "help.message",
    "I could use some company. Are you able to talk?",
  );
  const [status, setStatus] = useDraft("help.status");
  const resource = helpResources.find((r) => r.region === state.region);
  return (
    <>
      <PageHeading
        eyebrow="Help & support"
        description="If you are in immediate danger, call your local emergency number or go to the nearest emergency department, if you can."
      >
        {tone(state.appearance.tone, "help", state.energy).message}
      </PageHeading>
      {!state.providerEnabled && (
        <Notice>
          Suggestions are off. Everything on this page still works.
        </Notice>
      )}
      {state.scenario === "coaching paused" && (
        <Notice>
          UX preview; not a validated safety response. Ordinary coaching is
          paused. No real input was assessed.
        </Notice>
      )}
      <p className="prose">
        Koe can&apos;t check on you, assess danger or contact anyone. This page
        is not a staffed service. It points you to people who are.
      </p>
      <div className="split">
        <section>
          <Select
            label="Country / region"
            value={state.region}
            onChange={(region) =>
              dispatch({ type: "profile", value: { region } })
            }
            options={regionOptions}
          />
          {resource ? (
            <div className="panel">
              <p className="eyebrow">{resource.country}</p>
              <h2>{resource.name}</h2>
              {resource.localName && (
                <p lang={languages[resource.region]}>{resource.localName}</p>
              )}
              <p style={{ fontSize: "1.8rem", fontWeight: 500 }}>
                {resource.phone}
              </p>
              <p>
                {resource.channels} · {resource.hours ?? "Hours not confirmed"}
              </p>
              {resource.note && <p className="hint">{resource.note}</p>}
              <p className="meta">Last checked {resource.retrievedAt}</p>
              <p>Check locally before relying on this.</p>
              <a
                href={resource.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Official service information ↗
              </a>
            </div>
          ) : (
            <div className="panel">
              <h2>No verified resource listed yet.</h2>
              <p>
                Try official local health services, a nearby hospital or a
                community support service. Koe doesn&apos;t guess numbers.
              </p>
            </div>
          )}
        </section>
        <section>
          <h2>Message someone you trust</h2>
          <p>
            Edit the words, copy them, and send them yourself to someone you
            feel safe with. Koe sends nothing.
          </p>
          <Field
            label="Your message"
            multiline
            value={message}
            onChange={(value) => {
              setMessage(value);
              setStatus("");
            }}
            maxLength={1000}
          />
          <div className="actions">
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await copyText(message);
                  setStatus("Copied. Nothing was sent.");
                } catch {
                  setStatus(
                    "Copying didn't work here. Select the text and copy it yourself. Nothing was sent.",
                  );
                }
              }}
            >
              Copy message
            </button>
          </div>
          <button
            className="text"
            onClick={() =>
              setStatus(
                "Noted that you reached someone. Koe didn't contact anyone or check this.",
              )
            }
          >
            I reached someone
          </button>
          {status && <Notice>{status}</Notice>}
        </section>
      </div>
      <div className="actions">
        <ActionLink href="/help/report" secondary>
          Report a problem
        </ActionLink>
        <ActionLink href="/today" secondary>
          Back to Today
        </ActionLink>
      </div>
    </>
  );
}
