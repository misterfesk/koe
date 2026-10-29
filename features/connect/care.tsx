"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import type { RiskLevel } from "@/domain/safety";
import { lookupAppointments } from "@/server/actions/connect";
import type { AppointmentResult } from "@/server/search/intents";
import { SafetyCheck } from "../safety/safety-check";
import styles from "./connect.module.css";

export function AppointmentLookup({ region }: { region: string | null }) {
  const [instructions, setInstructions] = useState("");
  const [results, setResults] = useState<AppointmentResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [status, setStatus] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();

  const onLookup = () => {
    setStatus("");
    startTransition(async () => {
      try {
        const res = await lookupAppointments(instructions);
        if (res.safety !== "none") {
          setSafety(res.safety);
          return;
        }
        setSearched(true);
        setResults(res.results);
        if (res.unavailable || !res.ok) {
          setStatus("Search is unavailable right now. Check back later.");
        } else if (res.results.length === 0) {
          setStatus(
            "No matching services came up. Try changing your instructions or check back later.",
          );
        }
      } catch {
        setSearched(true);
        setResults([]);
        setStatus("Search is unavailable right now. Check back later.");
      }
    });
  };

  if (safety !== "none") {
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  }

  return (
    <div className={styles.appointmentWrap}>
      <div className={styles.controlsBar}>
        <div className={styles.lookupActions}>
          <button
            type="button"
            className={styles.lookupButton}
            disabled={pending}
            onClick={onLookup}
          >
            {pending ? "Looking up…" : "Look up"}
          </button>
        </div>

        <details className={styles.instructionsDetails}>
          <summary className={styles.instructionsSummary}>
            Add instructions
          </summary>
          <div className={styles.instructionsBody}>
            <label htmlFor="appointment-instructions" className="meta">
              Add what kind of professional, subject or preference you want
              included.
            </label>
            <textarea
              id="appointment-instructions"
              rows={3}
              maxLength={300}
              placeholder="e.g. Online CBT therapist, math tutor, or evening appointments"
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setStatus("");
              }}
            />
          </div>
        </details>
      </div>

      {status && <Notice>{status}</Notice>}

      {searched && results.length > 0 && (
        <section
          className={styles.resultsSection}
          aria-labelledby="appointment-results-heading"
        >
          <h2
            id="appointment-results-heading"
            className={styles.resultsHeading}
          >
            Results
          </h2>
          <ul className={styles.resultsGrid}>
            {results.map((item) => (
              <li key={item.url} className={`panel ${styles.resultCard}`}>
                <div className={styles.resultBody}>
                  <p className={styles.resultSource}>{item.sourceName}</p>
                  <h3 className={styles.resultTitle}>{item.title}</h3>
                  <p className={styles.resultReason}>{item.why}</p>
                </div>
                <div className={styles.resultFooter}>
                  <a
                    className={`button secondary ${styles.goLink}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Go to link: ${item.title} (opens in a new tab)`}
                  >
                    Go to link <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={`meta ${styles.helpNote}`}>
        Need urgent support right now?{" "}
        <Link href="/help">
          Open Help <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
