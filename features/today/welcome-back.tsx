"use client";
import { useTransition } from "react";
import { welcomeBack } from "@/server/actions/steps";

/** After a week or more away. No backlog, no guilt, no "we missed you". */
export function WelcomeBack({ oldSteps }: { oldSteps: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <section className="panel" aria-labelledby="welcome-back">
      <h2 id="welcome-back">Welcome back.</h2>
      <p>
        There&apos;s nothing to catch up on.
        {oldSteps > 0 &&
          ` You have ${oldSteps} older ${oldSteps === 1 ? "step" : "steps"} from before. You can clear them for a fresh start; they stay in your history.`}
      </p>
      <div className="actions">
        {oldSteps > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => welcomeBack(true))}
          >
            Start fresh
          </button>
        )}
        <button
          type="button"
          className={oldSteps > 0 ? "secondary" : undefined}
          disabled={pending}
          onClick={() => startTransition(() => welcomeBack(false))}
        >
          {oldSteps > 0 ? "Keep them" : "Carry on"}
        </button>
      </div>
    </section>
  );
}
