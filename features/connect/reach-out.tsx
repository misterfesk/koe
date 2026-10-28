"use client";
import { useState, useTransition } from "react";
import { ConfirmDelete, Notice } from "@/components/ui";
import {
  channelLabels,
  purposeLabels,
  templateMessage,
  type Purpose,
} from "@/domain/connect";
import type { RiskLevel } from "@/domain/safety";
import {
  draftReachOut,
  followUp,
  markSent,
  removePerson,
  savePerson,
} from "@/server/actions/connect";
import type { PersonView, ReachOutView } from "@/server/data/people";
import { copyText } from "@/services/clipboard";
import { SafetyCheck } from "../safety/safety-check";
import { PlanForm } from "../today/plan-form";
import Link from "next/link";

export function ReachOut({
  people,
  region,
  owner,
}: {
  people: PersonView[];
  region: string | null;
  owner: string;
}) {
  const [personId, setPersonId] = useState<string | null>(
    people[0]?.id ?? null,
  );
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("hello");
  const [detail, setDetail] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [asked, setAsked] = useState(false);
  const [later, setLater] = useState(false);
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  const who = people.find((p) => p.id === personId);
  const shownName = who?.name ?? name;

  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;

  return (
    <div className="prose">
      <p className="hint">Every question is optional.</p>
      <fieldset className="chips">
        <legend>Who?</legend>
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed={personId === p.id}
            onClick={() => setPersonId(p.id)}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={personId === null}
          onClick={() => setPersonId(null)}
        >
          {people.length ? "Someone else" : "Someone"}
        </button>
      </fieldset>
      {personId === null && (
        <div className="field">
          <label htmlFor="reach-name">Their name</label>
          <input
            id="reach-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <fieldset className="chips">
        <legend>What about?</legend>
        {(Object.keys(purposeLabels) as Purpose[]).map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            aria-pressed={purpose === p}
            onClick={() => setPurpose(p)}
          >
            {purposeLabels[p]}
          </button>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="reach-detail">Anything to include?</label>
        <input
          id="reach-detail"
          value={detail}
          maxLength={300}
          placeholder="You haven't talked since her birthday"
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setStatus("");
              setAsked(false);
              const r = await draftReachOut({
                personId,
                name,
                purpose,
                detail,
              });
              if (r.safety !== "none") setSafety(r.safety);
              setDraft(r.message);
            })
          }
        >
          {pending ? "Drafting…" : draft ? "Draft again" : "Draft a message"}
        </button>
        {!draft && (
          <button
            type="button"
            className="secondary"
            onClick={() => setDraft(templateMessage(purpose, shownName))}
          >
            Write it myself
          </button>
        )}
      </div>

      {draft !== null && (
        <section className="panel" aria-labelledby="draft">
          <div className="field">
            <label htmlFor="draft" id="draft-label">
              Your message
            </label>
            <p className="hint">Change anything so it sounds like you.</p>
            <textarea
              id="draft"
              rows={4}
              maxLength={1000}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
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
                  await copyText(draft);
                  setStatus("Copied. Nothing was sent.");
                } catch {
                  setStatus(
                    "Copying didn't work here. Select the text and copy it yourself.",
                  );
                }
                setAsked(true);
              }}
            >
              Copy
            </button>
            <a
              className="button secondary"
              href={"sms:?&body=" + encodeURIComponent(draft)}
              onClick={() => setAsked(true)}
            >
              Open in Messages
            </a>
            {who?.channel === "email" && (
              <a
                className="button secondary"
                href={"mailto:?body=" + encodeURIComponent(draft)}
                onClick={() => setAsked(true)}
              >
                Open in email
              </a>
            )}
            <button
              type="button"
              className="text"
              onClick={() => setLater(true)}
            >
              Add this to today
            </button>
          </div>
          {status && <Notice>{status}</Notice>}
          {status.startsWith("Added to today") && (
            <p>
              <Link href="/today">See today&apos;s plan →</Link>
            </p>
          )}
          {asked && (
            <div className="actions" role="group" aria-label="Did you send it?">
              <span>Did you send it?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await markSent({ personId, draft });
                    if (r.safety !== "none") setSafety(r.safety);
                    setDraft(null);
                    setAsked(false);
                    setStatus("");
                    setDetail("");
                  })
                }
              >
                Save that you sent it
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setAsked(false)}
              >
                Not yet
              </button>
            </div>
          )}
          {later && (
            <PlanForm
              draftKey={"reach-out:" + owner + ":" + (personId ?? "someone")}
              region={region}
              initial={{
                kind: "reach_out",
                title: shownName
                  ? `Send ${shownName} a message`
                  : "Send someone a message",
              }}
              onCancel={() => setLater(false)}
              onDone={() => {
                setLater(false);
                setStatus("Added to today. Your message stays here.");
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}

export function FollowUps({
  items,
  people,
}: {
  items: ReachOutView[];
  people: PersonView[];
}) {
  const [, startTransition] = useTransition();
  const open = items.filter((i) => i.status === "sent");
  const answered = items.filter(
    (i) => i.status === "replied" || i.status === "no_reply",
  );
  if (!open.length && !answered.length) return null;
  const nameOf = (i: ReachOutView) =>
    people.find((p) => p.id === i.personId)?.name ?? "them";
  return (
    <section aria-labelledby="follow">
      <h2 id="follow">Since you reached out</h2>
      <ul className="rows">
        {open.map((i) => (
          <li key={i.id}>
            <p className="meta">You sent: &ldquo;{i.draft}&rdquo;</p>
            <div className="actions" role="group" aria-label="Did they reply?">
              <span>Did {nameOf(i)} reply?</span>
              <button
                type="button"
                className="secondary"
                onClick={() => startTransition(() => followUp(i.id, "replied"))}
              >
                Yes
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  startTransition(() => followUp(i.id, "no_reply"))
                }
              >
                Not yet
              </button>
            </div>
          </li>
        ))}
      </ul>
      {answered.length > 0 && (
        <p className="meta">
          {answered.filter((i) => i.status === "replied").length} of your last{" "}
          {answered.length} messages got a reply. No reply yet is common; people
          are often just busy.
        </p>
      )}
    </section>
  );
}

export function People({ people }: { people: PersonView[] }) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<PersonView["channel"]>("message");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="people">
      <h2 id="people">Your people</h2>
      <p className="hint">
        People you might want to stay in touch with. Only a name or nickname; no
        phone numbers are stored.
      </p>
      {people.length > 0 && (
        <ul className="rows">
          {people.map((p) => (
            <li key={p.id} className="row-split">
              <span>
                {p.name}{" "}
                <span className="meta">· {channelLabels[p.channel]}</span>
              </span>
              <ConfirmDelete
                label="Remove"
                question={`Remove ${p.name}?`}
                detail="Messages you planned stay in your history."
                onConfirm={() => startTransition(() => removePerson(p.id))}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await savePerson({ name, channel });
            if (!r.ok) return setError(r.error ?? "");
            setError("");
            setName("");
          });
        }}
      >
        <div className="field">
          <label htmlFor="person-name">Name or nickname</label>
          <input
            id="person-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "person-error" : undefined}
          />
          {error && (
            <p id="person-error" className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="person-channel">Usually by</label>
          <select
            id="person-channel"
            value={channel}
            onChange={(e) =>
              setChannel(e.target.value as PersonView["channel"])
            }
          >
            {Object.entries(channelLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="secondary" disabled={pending}>
          Add person
        </button>
      </form>
    </section>
  );
}
