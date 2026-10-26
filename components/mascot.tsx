"use client";
import { usePathname } from "next/navigation";
import { useSession } from "./session";
import { currentReport } from "@/domain/state";
import styles from "./shell.module.css";
export function Mascot() {
  const { state } = useSession();
  const path = usePathname();
  if (!state.appearance.mascot || state.appearance.plain) return null;
  const active = state.steps.find((step) => step.id === state.activeId);
  const report = currentReport(active);
  const calm =
    state.appearance.tone !== "expressive" ||
    state.energy === "low" ||
    state.declined ||
    state.scenario === "coaching paused" ||
    path.startsWith("/help") ||
    path.startsWith("/reflect") ||
    path === "/connect/care" ||
    ["No reply", "Prefer not to say"].includes(state.contactOutcome) ||
    (!!report && report.outcome !== "Done");
  return (
    <span
      data-mascot
      data-mode={calm ? "calm" : "expressive"}
      className={styles.mascot}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 56" width="46" height="40" fill="none">
        <path
          d="M13 37C5 14 27 5 40 10c16 6 21 32 7 37-14 6-30 4-34-10Z"
          fill="var(--rose)"
          stroke="var(--coffee)"
          strokeWidth="1.5"
        />
        <path d="M26 10c-1-5 3-8 7-8-1 5-3 7-7 8Z" fill="var(--coffee)" />
        {calm ? (
          <path
            d="M24 28h4m10 0h4"
            stroke="var(--coffee)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <>
            <circle cx="26" cy="28" r="1.5" fill="var(--coffee)" />
            <circle cx="40" cy="28" r="1.5" fill="var(--coffee)" />
          </>
        )}
        <path
          d="M30 36h6"
          stroke="var(--coffee)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
