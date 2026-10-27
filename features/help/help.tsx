"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { regionOptions, resourceFor, telHref } from "@/fixtures/help-resources";
import { setRegion } from "@/server/actions/settings";
import { copyText } from "@/services/clipboard";

const languages: Record<string, string> = {
  JP: "ja",
  KR: "ko",
  IN: "hi",
  LT: "lt",
  PL: "pl",
};

export function Help({ region }: { region: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState(
    "I'm having a hard time. Are you able to talk?",
  );
  const [status, setStatus] = useState("");
  const resource = resourceFor(region);
  return (
    <>
      {resource?.emergency ? (
        <a className="button urgent" href={telHref(resource.emergency)}>
          In danger now? Call {resource.emergency}
        </a>
      ) : (
        <p>
          <strong>In danger now?</strong> Call your local emergency number or go
          to the nearest emergency department.
        </p>
      )}
      <div className="split">
        <section aria-labelledby="line">
          <div className="field">
            <label htmlFor="region">Country / region</label>
            <select
              id="region"
              value={region}
              onChange={(e) => {
                const next = e.target.value;
                startTransition(async () => {
                  await setRegion(next);
                  router.replace("/help?region=" + next, { scroll: false });
                });
              }}
            >
              {regionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {resource ? (
            <div className="panel">
              <p className="eyebrow" id="line">
                {resource.country}
              </p>
              <h2>{resource.name}</h2>
              {resource.localName && (
                <p lang={languages[resource.region]}>{resource.localName}</p>
              )}
              <a className="button" href={telHref(resource.phone)}>
                Call {resource.phone}
              </a>
              <p style={{ marginTop: 16 }}>
                {resource.channels} · {resource.hours ?? "Hours not confirmed"}
              </p>
              {resource.note && <p className="hint">{resource.note}</p>}
              {resource.emergency && (
                <p>Emergency services: {resource.emergency}</p>
              )}
              <p className="meta">
                Last checked {resource.retrievedAt}. Check locally before
                relying on this.
              </p>
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
              <h2 id="line">No checked line for this region yet.</h2>
              <p>
                Try your local emergency number, a doctor, a nearby hospital or
                a community support service. Koe doesn&apos;t guess numbers.
              </p>
            </div>
          )}
        </section>
        <section aria-labelledby="message">
          <h2 id="message">Message someone you trust</h2>
          <p>
            Edit the words, copy them, and send them yourself. Koe sends
            nothing.
          </p>
          <div className="field">
            <label htmlFor="help-message">Your message</label>
            <textarea
              id="help-message"
              rows={4}
              maxLength={1000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setStatus("");
              }}
            />
          </div>
          <div className="actions">
            <button
              type="button"
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
            <a
              className="button secondary"
              href={"sms:?&body=" + encodeURIComponent(message)}
            >
              Open in Messages
            </a>
          </div>
          {status && <Notice>{status}</Notice>}
        </section>
      </div>
    </>
  );
}
