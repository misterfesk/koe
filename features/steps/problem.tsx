"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RiskLevel } from "@/domain/safety";
import { problemIdeas } from "@/server/actions/steps";
import { SafetyCheck } from "../safety/safety-check";
import { PlanForm } from "./plan-form";

type Stage = "problem" | "options" | "choose" | "plan";

/**
 * Structured problem solving: name one practical problem, list options
 * without judging them, pick the most doable one, and plan it as a step.
 */
export function ProblemSolver({ region }: { region: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("problem");
  const [problem, setProblem] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  const filled = options.map((o) => o.trim()).filter(Boolean);

  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;

  return (
    <div className="prose">
      <p className="meta">
        Step {["problem", "options", "choose", "plan"].indexOf(stage) + 1} of 4
      </p>

      {stage === "problem" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem.trim())
              return setError("Write the problem in a few words.");
            setError("");
            setStage("options");
          }}
        >
          <div className="field">
            <label htmlFor="problem">What&apos;s the problem?</label>
            <p className="hint" id="problem-hint">
              One practical thing, as specific as you can. &ldquo;I keep putting
              off replying to my landlord&rdquo; works better than
              &ldquo;everything&apos;s a mess&rdquo;.
            </p>
            <textarea
              id="problem"
              rows={3}
              maxLength={1000}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              aria-describedby={error ? "problem-error" : "problem-hint"}
              aria-invalid={!!error}
            />
            {error && (
              <p id="problem-error" className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="actions">
            <button>Next: options</button>
          </div>
        </form>
      )}

      {stage === "options" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!filled.length)
              return setError("Write at least one option, even a small one.");
            setError("");
            setChosen((c) => (filled.includes(c) ? c : filled[0]));
            setStage("choose");
          }}
        >
          <div className="panel">
            <p className="eyebrow">The problem</p>
            <p>{problem}</p>
          </div>
          <h2>What could you do about it?</h2>
          <p className="hint">
            List anything, even options that seem unlikely. Don&apos;t judge
            them yet.
          </p>
          {options.map((o, i) => (
            <div className="field" key={i}>
              <label htmlFor={"option-" + i}>Option {i + 1}</label>
              <input
                id={"option-" + i}
                value={o}
                maxLength={140}
                onChange={(e) =>
                  setOptions((list) =>
                    list.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
            </div>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            {options.length < 6 && (
              <button
                type="button"
                className="secondary"
                onClick={() => setOptions((l) => [...l, ""])}
              >
                Add another option
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setNote("");
                  const r = await problemIdeas(problem, filled);
                  if (r.safety !== "none") return setSafety(r.safety);
                  if (!r.ideas.length)
                    return setNote(
                      "Koe couldn't suggest anything right now. Your own ideas are enough.",
                    );
                  setOptions([...filled, ...r.ideas].slice(0, 8));
                })
              }
            >
              {pending ? "Thinking…" : "Suggest some ideas"}
            </button>
          </div>
          {note && <p className="meta">{note}</p>}
          <div className="actions">
            <button>Next: choose one</button>
            <button
              type="button"
              className="text"
              onClick={() => setStage("problem")}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {stage === "choose" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStage("plan");
          }}
        >
          <h2>Which one will you try first?</h2>
          <p className="hint">
            Pick the one that seems most doable, not the perfect one. You can
            try another later.
          </p>
          <fieldset className="chips">
            <legend className="sr-only">Options</legend>
            {filled.map((o) => (
              <label key={o} className="chip">
                <input
                  type="radio"
                  name="chosen"
                  checked={chosen === o}
                  onChange={() => setChosen(o)}
                />
                <span>{o}</span>
              </label>
            ))}
          </fieldset>
          <div className="actions">
            <button>Next: plan it</button>
            <button
              type="button"
              className="text"
              onClick={() => setStage("options")}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {stage === "plan" && (
        <>
          <h2>Plan it</h2>
          <p className="hint">
            Make the first part small. Afterwards, say how it went. If it
            didn&apos;t work, that&apos;s information: try the next option.
          </p>
          <PlanForm
            region={region}
            initial={{ area: "do", title: chosen, problem }}
            onCancel={() => setStage("choose")}
            onDone={(id) => router.push("/steps/" + id)}
          />
        </>
      )}
    </div>
  );
}
