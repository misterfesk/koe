"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { resourceFor, telHref } from "@/fixtures/help-resources";
import { resumeCoaching } from "@/server/actions/steps";

// Fixed wording shown when something a person wrote matches a risk pattern.
// The model never writes this and never generates phone numbers: numbers
// come only from the verified, dated Help listings.
// UNREVIEWED: a qualified clinician must approve this flow before real users.

export function SafetyCheck({
  region,
  onResume,
  resume = resumeCoaching,
}: {
  region: string | null;
  /** Called after the person chooses to carry on. */
  onResume?: () => void;
  /** What "Carry on" clears; by default the account-wide coaching pause. */
  resume?: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState<"safe" | "unsafe" | null>(null);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const resource = resourceFor(region);
  useEffect(() => {
    heading.current?.focus();
  }, [answer]);
  const line = resource && (
    <div className="panel">
      <p className="eyebrow">{resource.country}</p>
      <h3>{resource.name}</h3>
      <a className="button" href={telHref(resource.phone)}>
        Call {resource.phone}
      </a>
      <p className="meta">
        {resource.channels} · {resource.hours ?? "Hours not confirmed"}
      </p>
    </div>
  );
  return (
    <section className="safety" aria-labelledby="safety-heading">
      {answer === null && (
        <>
          <h2 id="safety-heading" ref={heading} tabIndex={-1}>
            Before anything else: are you safe right now?
          </h2>
          <p>
            Some of what you wrote sounds really painful. Koe can&apos;t help in
            an emergency, but people can, right now.
          </p>
          <div className="actions">
            <button type="button" onClick={() => setAnswer("safe")}>
              I&apos;m safe for now
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setAnswer("unsafe")}
            >
              I&apos;m not safe
            </button>
          </div>
          <p className="meta">
            Not sure? Treat it as not safe. <Link href="/help">Help now</Link>{" "}
            lists people you can reach.
          </p>
        </>
      )}
      {answer === "unsafe" && (
        <>
          <h2 id="safety-heading" ref={heading} tabIndex={-1}>
            Please contact someone now.
          </h2>
          {resource?.emergency ? (
            <a className="button urgent" href={telHref(resource.emergency)}>
              Call emergency services: {resource.emergency}
            </a>
          ) : (
            <p>
              <strong>Call your local emergency number</strong>, or go to the
              nearest emergency department.
            </p>
          )}
          <p>
            If you can, tell someone near you and stay with them. You don&apos;t
            have to explain everything.
          </p>
          {line}
          <p className="meta">
            <Link href="/help">See all Help options</Link>
          </p>
        </>
      )}
      {answer === "safe" && (
        <>
          <h2 id="safety-heading" ref={heading} tabIndex={-1}>
            Thanks for answering.
          </h2>
          <p>
            If it gets worse, Help now is at the top of every screen. Talking to
            a person can help even when you&apos;re not in danger.
          </p>
          {line}
          <div className="actions">
            <Link className="button secondary" href="/help#message">
              Message someone you trust
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await resume();
                  onResume?.();
                })
              }
            >
              Carry on with Koe
            </button>
          </div>
        </>
      )}
    </section>
  );
}
