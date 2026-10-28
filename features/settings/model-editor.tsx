"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ConfirmDelete, Field } from "@/components/ui";
import {
  busiestLabels,
  busiestTimes,
  dayKinds,
  dayLabels,
  emptyModel,
  goals,
  goalLabels,
  lifts,
  liftLabels,
  morningPlans,
  peopleKinds,
  peopleLabels,
  supports,
  supportLabels,
  introTones,
  toneChoices,
  wakes,
  wakeLabels,
  type IntakeModel,
} from "@/domain/intake";
import { clearsWords, modelEdit } from "@/domain/model-edit";
import type { z } from "zod";
import type { RiskLevel } from "@/domain/safety";
import { editUserModel } from "@/server/actions/settings";
import type { UserModelView } from "@/server/data/intake";
import { SafetyCheck } from "../safety/safety-check";

export function ModelEditor({
  saved,
  region,
  owner,
}: {
  saved: UserModelView | null;
  region: string | null;
  owner: string;
}) {
  const [baseline, setBaseline] = useState({
    model: saved?.model ?? emptyModel(),
    summary: saved?.summary ?? "",
  });
  const [model, setModel] = useState(baseline.model);
  const [summary, setSummary] = useState(baseline.summary);
  const [version, setVersion] = useState(saved?.version ?? 0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<RiskLevel>("none");
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);
  const [earlier, setEarlier] = useState<z.output<typeof modelEdit> | null>(
    null,
  );
  const storageKey = "koe.plan-draft:model:" + owner;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw ? modelEdit.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) {
        if (parsed.data.version === (saved?.version ?? 0)) {
          // Browser drafts are restored after hydration.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setModel({
            ...parsed.data.model,
            eatingConcern: saved?.model.eatingConcern ?? false,
          });
          setSummary(parsed.data.summary);
        } else setEarlier(parsed.data);
      }
    } catch {
      /* A blocked or malformed store leaves the saved answers usable. */
    }
    setReady(true);
    // Restore once per owner, never after a save or an unrelated revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const update = <K extends keyof IntakeModel>(
    key: K,
    value: IntakeModel[K],
  ) => {
    setModel({ ...model, [key]: value });
    setMessage("");
  };
  const dirty = JSON.stringify(baseline) !== JSON.stringify({ model, summary });
  const clearing = clearsWords(baseline, { model, summary });
  useEffect(() => {
    if (!ready || earlier) return;
    try {
      if (dirty) {
        const { eatingConcern: _derived, ...answers } = model;
        void _derived;
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            version,
            summary,
            model: {
              ...answers,
              names: answers.names.filter((name) => name.name.trim()),
            },
          }),
        );
      } else sessionStorage.removeItem(storageKey);
    } catch {
      /* Tab-local drafts are best effort. */
    }
  }, [ready, earlier, dirty, model, summary, version, storageKey]);
  const save = () =>
    startTransition(async () => {
      // The derived flag is intentionally omitted from the browser payload.
      const { eatingConcern: _derived, ...answers } = model;
      void _derived;
      const result = await editUserModel({
        model: {
          ...answers,
          names: answers.names.filter((n) => n.name.trim()),
        },
        summary,
        version,
      });
      if (!result.ok) return setError(result.error ?? "Try saving again.");
      setVersion(result.version!);
      setBaseline({ model, summary });
      setError("");
      setMessage("Your information is saved. Your day stays as it is.");
      setSafety(result.safety ?? "none");
    });
  if (safety !== "none")
    return <SafetyCheck region={region} onResume={() => setSafety("none")} />;
  const choice = <T extends string>(
    label: string,
    value: T | undefined,
    values: readonly T[],
    labels: Record<T, string>,
    onChange: (v: T | undefined) => void,
  ) => (
    <label className="field">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange((e.target.value || undefined) as T | undefined)
        }
      >
        <option value="">No answer saved</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {labels[v]}
          </option>
        ))}
      </select>
    </label>
  );
  if (!ready)
    return (
      <p className="meta" role="status">
        Loading your saved information…
      </p>
    );
  const checks = <T extends string>(
    label: string,
    selected: T[],
    values: readonly T[],
    labels: Record<T, string>,
    onChange: (v: T[]) => void,
    max = values.length,
  ) => (
    <fieldset>
      <legend>{label}</legend>
      {values.map((v) => (
        <label className="toggle" key={v}>
          <input
            type="checkbox"
            checked={selected.includes(v)}
            disabled={!selected.includes(v) && selected.length >= max}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, v]
                  : selected.filter((x) => x !== v),
              )
            }
          />
          {labels[v]}
        </label>
      ))}
    </fieldset>
  );
  const note = (key: keyof IntakeModel["notes"], label: string) => (
    <Field
      label={label}
      value={model.notes[key] ?? ""}
      onChange={(value) =>
        update("notes", { ...model.notes, [key]: value || undefined })
      }
      maxLength={200}
      multiline
    />
  );
  return (
    <section aria-labelledby="saved-information">
      <h2 id="saved-information">Your saved information</h2>
      <p>Every question is optional. Save when your changes are ready.</p>
      <p className="meta">Unsaved changes stay in this tab when you leave.</p>
      {earlier && (
        <div className="panel">
          <p>
            Your saved information changed elsewhere. Your earlier draft stays
            in this tab.
          </p>
          <p>
            Review the earlier draft before saving it over your current answers.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setModel({
                ...earlier.model,
                eatingConcern: model.eatingConcern,
              });
              setSummary(earlier.summary);
              setEarlier(null);
            }}
          >
            Use your earlier draft
          </button>
          <ConfirmDelete
            label="Discard earlier draft"
            question="Discard your earlier draft?"
            onConfirm={() => setEarlier(null)}
          />
        </div>
      )}
      <p className="meta">
        Names saved here do not add or contact anyone in People.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!clearing && dirty) save();
        }}
      >
        <fieldset disabled={pending}>
          <Field
            label="Your summary"
            value={summary}
            onChange={(value) => {
              setSummary(value);
              setMessage("");
            }}
            maxLength={400}
            multiline
            grow
          />
          <details>
            <summary>What matters to you</summary>
            {checks(
              "What would you like help with? Pick up to two.",
              model.goals,
              goals,
              {
                ...goalLabels,
                enjoy_again: "Getting back to things you enjoyed",
              },
              (v) => update("goals", v),
              2,
            )}
            {note("goals", "More about what matters to you")}
            <Field
              label="Something you are putting off"
              value={model.puttingOff ?? ""}
              maxLength={200}
              multiline
              onChange={(v) => update("puttingOff", v || undefined)}
            />
          </details>
          <details>
            <summary>Your usual day</summary>
            {choice(
              "When do you usually wake?",
              model.wake,
              wakes,
              wakeLabels,
              (v) => update("wake", v),
            )}
            {choice(
              "How do you spend your days?",
              model.days,
              dayKinds,
              dayLabels,
              (v) => update("days", v),
            )}
            {choice(
              "When are you busiest?",
              model.busiest,
              busiestTimes,
              busiestLabels,
              (v) => update("busiest", v),
            )}
            {note("day", "More about your day")}
          </details>
          <details>
            <summary>Things you enjoy</summary>
            {checks(
              "What used to lift you a little?",
              model.lifts,
              lifts,
              liftLabels,
              (v) => update("lifts", v),
            )}
            {note("lifts", "More about what you enjoy")}
          </details>
          <details>
            <summary>People and care</summary>
            {checks(
              "Who is in your corner?",
              model.people,
              peopleKinds,
              peopleLabels,
              (v) => update("people", v),
            )}
            {[0, 1, 2].map((index) => (
              <Field
                key={index}
                label={`Name ${index + 1}`}
                value={model.names[index]?.name ?? ""}
                maxLength={40}
                onChange={(name) => {
                  const names = [0, 1, 2].map((i) => ({
                    name: i === index ? name : (model.names[i]?.name ?? ""),
                    save: false,
                  }));
                  // Keep empty slots while editing, so a later name does not jump fields.
                  update("names", names);
                }}
              />
            ))}
            {choice(
              "Are you seeing anyone for support?",
              model.support,
              supports,
              { ...supportLabels, rather_not_say: "Rather not say" },
              (v) => update("support", v),
            )}
            {note("people", "More about people and care")}
          </details>
          <details>
            <summary>Preferences from your intro</summary>
            <p className="meta">
              These are saved answers. Your active settings are in Appearance
              and Reminders.
            </p>
            {choice(
              "Tone saved from your intro",
              model.tone,
              introTones,
              Object.fromEntries(
                toneChoices.map((t) => [t.value, t.label]),
              ) as Record<(typeof introTones)[number], string>,
              (v) => update("tone", v),
            )}
            {choice(
              "Reminder time saved from your intro",
              model.morningPlan,
              morningPlans,
              {
                "07:00": "07:00",
                "08:00": "08:00",
                "09:00": "09:00",
                "10:00": "10:00",
                none: "No reminder",
              },
              (v) => update("morningPlan", v),
            )}
            <p>
              <Link href="/you/appearance">Appearance</Link> ·{" "}
              <Link href="/you/reminders">Reminders</Link>
            </p>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            {clearing ? (
              <ConfirmDelete
                label="Save and clear words"
                question="Clear these saved words?"
                detail="Your other changes are saved at the same time."
                onConfirm={save}
              />
            ) : (
              <button disabled={!dirty || pending}>
                Save your information
              </button>
            )}
            <Link href="/you">Back to You</Link>
          </div>
        </fieldset>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
