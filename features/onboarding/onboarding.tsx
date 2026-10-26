"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, useDraft } from "@/components/session";
import { PageHeading, Select, Toggle, ActionLink } from "@/components/ui";
import type { Energy } from "@/domain/tone";
import { regionOptions } from "@/fixtures/help-resources";
export function Onboarding() {
  const { state, dispatch } = useSession();
  const [stage, setStage] = useDraft("onboarding.stage", "0");
  const [error, setError] = useState("");
  const router = useRouter();
  const n = Number(stage);
  return (
    <>
      <PageHeading
        eyebrow={"Getting started · " + (n + 1) + " of 3"}
        description={
          [
            "Three short questions. You can skip setup at any point.",
            "These set today's suggestion. You can change energy on Today.",
            "Help & support shows a verified service for this region.",
          ][n]
        }
      >
        {[
          "Before you start",
          "What would you like more time for?",
          "Where are you?",
        ][n] ?? "Getting started"}
      </PageHeading>
      <div className="prose">
        {n === 0 ? (
          <>
            <p>
              This private review is for adults. Use fictional details only. Koe
              is software, not a person or a clinician.
            </p>
            <div className="panel">
              <h2>What this build does</h2>
              <p>
                It suggests small steps, offers scripted reflection and helps
                you prepare to reach people. It can&apos;t assess danger or
                provide treatment.
              </p>
              <p>
                There is no live AI. What you type stays in this tab until you
                reload. Nothing is sent.
              </p>
            </div>
            <Toggle
              label="I am reviewing this as an adult (18+)"
              checked={state.adult}
              onChange={(adult) => {
                dispatch({ type: "profile", value: { adult } });
                setError("");
              }}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </>
        ) : n === 1 ? (
          <>
            <Select
              label="Focus"
              value={state.goal}
              onChange={(goal) =>
                dispatch({ type: "profile", value: { goal } })
              }
              options={[
                "Make room for myself",
                "Enjoyment",
                "Rest",
                "Connection",
                "Everyday care",
                "Care access",
              ].map((x) => ({ value: x, label: x }))}
            />
            <Select
              label="Energy today"
              value={state.energy}
              onChange={(value) =>
                dispatch({ type: "energy", value: value as Energy })
              }
              options={[
                { value: "unknown", label: "Prefer not to say" },
                { value: "low", label: "Low · keep things quiet" },
                { value: "steady", label: "A little room" },
                { value: "more", label: "More room today" },
              ]}
            />
            <p className="hint">
              Energy changes how big the suggestion is and how Koe sounds. It
              isn&apos;t an assessment.
            </p>
          </>
        ) : (
          <>
            <Select
              label="Country / region"
              value={state.region}
              onChange={(region) =>
                dispatch({ type: "profile", value: { region } })
              }
              options={regionOptions}
            />
            <p>
              Help & support is in the header on every screen, whether or not
              you finish setup.
            </p>
          </>
        )}
        <div className="actions">
          {n > 0 && (
            <button
              className="secondary"
              onClick={() => setStage(String(n - 1))}
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (n === 0 && !state.adult) {
                setError(
                  "Confirm you're 18 or older to continue, or skip setup.",
                );
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>('main input[type="checkbox"]')
                    ?.focus(),
                );
                return;
              }
              if (n < 2) setStage(String(n + 1));
              else {
                dispatch({ type: "profile", value: { onboarded: true } });
                router.push("/today");
              }
            }}
          >
            {n < 2 ? "Continue" : "Open Today"}
          </button>
          <ActionLink href="/today" secondary>
            Skip setup
          </ActionLink>
        </div>
      </div>
    </>
  );
}
