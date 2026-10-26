"use client";

import { CoachingPaused } from "@/components/coaching-paused";
import { useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { useDraft, useSession } from "@/components/session";
import {
  ActionLink,
  Field,
  Notice,
  PageHeading,
  Select,
  Toggle,
} from "@/components/ui";
import { reminderInput, reminderPreview } from "@/domain/reminders";
import { advanceClock } from "@/services/clock";

const hours = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: String(hour).padStart(2, "0") + ":00",
}));
const zones = [
  "UTC",
  "America/New_York",
  "Europe/London",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Europe/Vilnius",
  "Africa/Johannesburg",
  "Europe/Warsaw",
];
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const virtualTimeInput = z.string().datetime({
  offset: true,
  message: "Use an ISO time with Z or an offset, like 2026-10-26T09:00Z.",
});

export function ReminderSettings() {
  const { state, dispatch } = useSession();
  const current = state.reminders;
  const [enabled, setEnabled] = useDraft(
    "reminder.config.enabled",
    String(current.enabled),
  );
  const [targetId, setTargetId] = useDraft(
    "reminder.config.target",
    current.targetId || state.activeId,
  );
  // A drafted target can be deleted elsewhere; never apply a step that no longer exists.
  const liveTargetId = state.steps.some((step) => step.id === targetId)
    ? targetId
    : "";
  const [timezone, setTimezone] = useDraft(
    "reminder.config.timezone",
    current.timezone,
  );
  const [hour, setHour] = useDraft(
    "reminder.config.hour",
    String(current.hour),
  );
  const [quietStart, setQuietStart] = useDraft(
    "reminder.config.quietStart",
    String(current.quietStart),
  );
  const [quietEnd, setQuietEnd] = useDraft(
    "reminder.config.quietEnd",
    String(current.quietEnd),
  );
  const [frequency, setFrequency] = useDraft(
    "reminder.config.frequency",
    current.frequency,
  );
  const [weekday, setWeekday] = useDraft(
    "reminder.config.weekday",
    String(current.weekday),
  );
  const [virtualTime, setVirtualTime] = useDraft(
    "reminder.clock.value",
    state.clock,
  );
  const [feedback, setFeedback] = useDraft("reminder.feedback");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clockError, setClockError] = useState("");
  const preview = useMemo(
    () =>
      reminderPreview({
        reminders: state.reminders,
        clock: state.clock,
        steps: state.steps,
        memories: state.memories,
        memoryConsent: state.memoryConsent,
        temporary: state.temporary,
      }),
    [
      state.reminders,
      state.clock,
      state.steps,
      state.memories,
      state.memoryConsent,
      state.temporary,
    ],
  );
  const selected = state.steps.find((step) => step.id === current.targetId);
  // The step being set up, which may come from the step page before it is applied.
  const focus =
    state.steps.find((step) => step.id === liveTargetId) ?? selected;

  function focusError(form: "preferences" | "clock") {
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          'main form[data-reminder-form="' + form + '"] [aria-invalid="true"]',
        )
        ?.focus(),
    );
  }

  function apply(e: FormEvent) {
    e.preventDefault();
    const result = reminderInput.safeParse({
      ...current,
      enabled: enabled === "true",
      targetId: liveTargetId,
      timezone,
      hour: Number(hour),
      quietStart: Number(quietStart),
      quietEnd: Number(quietEnd),
      frequency,
      weekday: Number(weekday),
    });
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      focusError("preferences");
      return;
    }
    setErrors({});
    dispatch({ type: "reminders", value: result.data });
    dispatch({ type: "clearDraft", prefix: "reminder.config." });
    setFeedback("Preview updated. No notifications will be sent.");
    requestAnimationFrame(() =>
      document.getElementById("reminder-feedback")?.focus(),
    );
  }

  function advance(hours: number) {
    const next = advanceClock(state.clock, hours);
    if (!next) return;
    dispatch({ type: "clock", value: next });
    dispatch({ type: "clearDraft", prefix: "reminder.clock." });
    setFeedback("Virtual time moved forward.");
  }

  function applyTime(e: FormEvent) {
    e.preventDefault();
    const parsed = virtualTimeInput.safeParse(virtualTime.trim());
    const iso = parsed.success ? advanceClock(parsed.data, 0) : null;
    if (!iso) {
      setClockError(
        parsed.success
          ? "That time doesn't exist. Use an ISO time like 2026-10-26T09:00Z."
          : parsed.error.issues[0].message,
      );
      focusError("clock");
      return;
    }
    setClockError("");
    dispatch({ type: "clock", value: iso });
    dispatch({ type: "clearDraft", prefix: "reminder.clock." });
    setFeedback("Virtual time set.");
  }

  if (state.scenario === "coaching paused")
    return <CoachingPaused eyebrow="Reminder preview · review scenario" />;
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description={
          focus
            ? "When a reminder about “" +
              focus.title +
              "” would arrive. Koe never asks for notification permission or sends anything."
            : "Pick a step and see when a reminder would arrive, on a virtual clock. Koe never asks for notification permission or sends anything."
        }
      >
        Reminder preview
      </PageHeading>
      <div className="split">
        <form data-reminder-form="preferences" onSubmit={apply} noValidate>
          <Toggle
            label="Turn on a reminder preview"
            checked={enabled === "true"}
            onChange={(value) => setEnabled(String(value))}
          />
          <Select
            label="Step"
            value={liveTargetId}
            onChange={setTargetId}
            error={errors.targetId}
            options={[
              { value: "", label: "Choose a step" },
              ...state.steps.map((step) => ({
                value: step.id,
                label: step.title + (step.paused ? " (paused)" : ""),
              })),
            ]}
          />
          <Select
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            error={errors.timezone}
            options={zones.map((value) => ({
              value,
              label: value.replaceAll("_", " "),
            }))}
          />
          <Select
            label="Preferred local hour"
            value={hour}
            onChange={setHour}
            error={errors.hour}
            options={hours}
          />
          <Select
            label="Maximum frequency"
            value={frequency}
            onChange={setFrequency}
            error={errors.frequency}
            options={[
              { value: "daily", label: "At most once per local day" },
              { value: "weekly", label: "At most once per week" },
            ]}
          />
          {frequency === "weekly" && (
            <Select
              label="Local weekday"
              value={weekday}
              onChange={setWeekday}
              error={errors.weekday}
              options={days.map((label, index) => ({
                value: String(index),
                label,
              }))}
            />
          )}
          <div className="split">
            <Select
              label="Quiet hours start"
              value={quietStart}
              onChange={setQuietStart}
              error={errors.quietStart}
              options={hours}
            />
            <Select
              label="Quiet hours end"
              value={quietEnd}
              onChange={setQuietEnd}
              error={errors.quietEnd}
              options={hours}
            />
          </div>
          <p className="hint">
            A reminder due in quiet hours moves to when they end. The same start
            and end means no quiet hours. Daylight-saving gaps are skipped.
          </p>
          <button type="submit">Update preview</button>
        </form>
        <aside className="stack" aria-label="Applied reminder and virtual time">
          <section className="panel">
            <p className="eyebrow">With your saved settings</p>
            <h2>Next reminder would arrive</h2>
            {preview.kind === "ready" ? (
              <>
                <p>{preview.title}</p>
                <p>
                  <time data-next-preview dateTime={preview.at}>
                    {preview.local}
                  </time>
                  <br />
                  <span className="meta">{current.timezone}</span>
                </p>
                {preview.deferred && (
                  <p className="hint">Moved out of your quiet hours.</p>
                )}
                <p className="hint">
                  It would say: “Your step is here when you want it.”
                </p>
              </>
            ) : preview.kind === "idle" ? (
              <p>{preview.reason}</p>
            ) : (
              <p>No preview: {Object.values(preview.errors).join(" ")}</p>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={!current.enabled}
                onClick={() => {
                  dispatch({
                    type: "reminders",
                    value: { ...current, paused: !current.paused },
                  });
                  setFeedback(
                    current.paused ? "Preview resumed." : "Preview paused.",
                  );
                }}
              >
                {current.paused ? "Resume preview" : "Pause preview"}
              </button>
              {selected && (
                <ActionLink href={"/steps/" + selected.id} secondary>
                  Open step
                </ActionLink>
              )}
            </div>
            <p className="meta">
              A paused or deleted step has no reminder. Resuming a step leaves
              its preview paused until you resume it here.
            </p>
          </section>
          <section className="panel">
            <h2>Virtual time</h2>
            <p className="meta">
              Virtual clock now:{" "}
              <time dateTime={state.clock}>{state.clock}</time>
            </p>
            <form data-reminder-form="clock" onSubmit={applyTime} noValidate>
              <Field
                label="Set the virtual clock (ISO time)"
                value={virtualTime}
                onChange={setVirtualTime}
                error={clockError}
                maxLength={80}
              />
              <button className="secondary" type="submit">
                Set time
              </button>
            </form>
            <div className="actions">
              <button className="secondary" onClick={() => advance(1)}>
                +1 hour
              </button>
              <button className="secondary" onClick={() => advance(24)}>
                +1 day
              </button>
            </div>
            <p className="hint">
              Moving the clock never builds up missed reminders.
            </p>
          </section>
        </aside>
      </div>
      {feedback && <Notice id="reminder-feedback">{feedback}</Notice>}
      <div className="actions">
        {focus ? (
          <ActionLink href={"/steps/" + focus.id} secondary>
            Back to the step
          </ActionLink>
        ) : (
          <ActionLink href="/settings" secondary>
            Back to Settings
          </ActionLink>
        )}
      </div>
    </>
  );
}
