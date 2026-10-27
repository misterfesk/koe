"use client";
import { useTransition } from "react";
import { welcomeBack } from "@/server/actions/steps";

/** After a week or more away. No backlog, no guilt, no "we missed you". */
export function WelcomeBack({ older }: { older: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <section className="panel" aria-labelledby="welcome-back">
      <h2 id="welcome-back">Welcome back.</h2>
      <p>
        There&apos;s nothing to catch up on.
        {older > 0 &&
          ` ${older} older ${older === 1 ? "entry" : "entries"} from before ${older === 1 ? "is" : "are"} still around. Clear ${older === 1 ? "it" : "them"} for a fresh start; ${older === 1 ? "it stays" : "they stay"} in your history.`}
      </p>
      <div className="actions">
        {older > 0 && (
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
          className={older > 0 ? "secondary" : undefined}
          disabled={pending}
          onClick={() => startTransition(() => welcomeBack(false))}
        >
          {older > 0 ? "Keep them" : "Carry on"}
        </button>
      </div>
    </section>
  );
}
