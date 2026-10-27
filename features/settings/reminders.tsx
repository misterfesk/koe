"use client";
import { useState, useTransition } from "react";
import { IGNORE_LIMIT } from "@/domain/reminders";
import { describeDays, formatMinutes, weekdayOptions } from "@/domain/time";
import {
  removeReminder,
  saveReminder,
  setQuietHours,
  toggleReminder,
  turnOnMorningPlan,
} from "@/server/actions/settings";
import type { ReminderView } from "@/server/data/reminders";
import {
  enableNotifications,
  TestNow,
  useAllowed,
  usePushSupport,
} from "../reminders/notifications";

type Entry = { id: string; title: string; repeatDays: number[] | null };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Turns notifications on for this browser. Asked only when someone sets a reminder. */
export function DeviceNotifications({
  publicKey,
  subscribed,
}: {
  publicKey: string | null;
  subscribed: boolean;
}) {
  const [state, setState] = useState<string>("");
  const [justOn, setJustOn] = useState(false);
  const [pending, startTransition] = useTransition();
  const supported = usePushSupport();
  const allowed = useAllowed();
  if (!publicKey)
    return (
      <p className="meta">Reminders aren&apos;t set up on this server yet.</p>
    );
  if (!supported)
    return (
      <p className="meta">
        This browser can&apos;t show reminders. On iPhone, add Koe to your Home
        Screen first.
      </p>
    );
  const on = subscribed && allowed;
  return (
    <div className="panel">
      <p>
        {on
          ? "Reminders are on for this device."
          : "Reminders arrive as notifications. They show only the time, never what it is."}
      </p>
      <div className="actions">
        {!on && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await enableNotifications(publicKey);
                setState(r.ok ? "" : r.message);
                setJustOn(r.ok);
              })
            }
          >
            Turn on reminders
          </button>
        )}
        {(on || justOn) && <TestNow />}
      </div>
      {justOn && (
        <p className="meta" role="status">
          Reminders are on for this device.
        </p>
      )}
      {state && (
        <p className="error" role="alert">
          {state}
        </p>
      )}
    </div>
  );
}

/** The one daily "your day is ready" reminder. Off until the person turns it on. */
export function MorningPlanReminder({
  publicKey,
  subscribed,
  reminder,
  defaultMinute,
}: {
  publicKey: string | null;
  subscribed: boolean;
  reminder?: ReminderView;
  defaultMinute: number;
}) {
  const [time, setTime] = useState(
    formatMinutes(reminder?.minuteOfDay ?? defaultMinute),
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const allowed = useAllowed();
  if (!publicKey) return null;
  const on = !!reminder && !reminder.paused;
  const save = (ask: boolean) =>
    startTransition(async () => {
      setError("");
      if (ask && !(allowed && subscribed)) {
        const r = await enableNotifications(publicKey);
        if (!r.ok) return setError(r.message);
      }
      const r = await turnOnMorningPlan({ minuteOfDay: toMinutes(time) });
      if (!r.ok) setError(r.error ?? "");
    });
  return (
    <section aria-labelledby="morning-plan" style={{ marginTop: 32 }}>
      <h2 id="morning-plan">Morning plan reminder</h2>
      <p className="hint">
        One reminder a day, when your day is ready. It stays off until you turn
        it on.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            if (e.target.checked) save(true);
            else if (reminder)
              startTransition(() => removeReminder(reminder.id));
          }}
        />
        <span>Remind me when my day is ready</span>
      </label>
      {reminder?.paused && (
        <p className="meta">
          {reminder.ignoredCount >= IGNORE_LIMIT
            ? "Paused after a few went unanswered. Turn it on again any time."
            : "Paused."}
        </p>
      )}
      <div className="inline-form">
        <div className="field">
          <label htmlFor="morning-time">Time</label>
          <input
            id="morning-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        {reminder && (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => save(false)}
          >
            Save time
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function ReminderRow({
  step,
  reminder,
  focus,
  quiet,
}: {
  step: Entry;
  reminder?: ReminderView;
  focus: boolean;
  /** The reminder's time falls inside quiet hours, so it won't arrive. */
  quiet: boolean;
}) {
  const [open, setOpen] = useState(focus && !reminder);
  const [time, setTime] = useState(
    formatMinutes(reminder?.minuteOfDay ?? 10 * 60),
  );
  const [days, setDays] = useState<number[]>(
    reminder?.days ?? step.repeatDays ?? [0, 1, 2, 3, 4, 5, 6],
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <li id={"step-" + step.id}>
      <h3>{step.title}</h3>
      {reminder && !open && (
        <>
          <p className="meta">
            {reminder.paused
              ? reminder.ignoredCount >= IGNORE_LIMIT
                ? "Paused after a few went unanswered. Turn it back on any time."
                : "Paused"
              : `${formatMinutes(reminder.minuteOfDay)} · ${describeDays(reminder.days)}`}
          </p>
          {quiet && !reminder.paused && (
            <p className="error">
              This time is inside your quiet hours, so it won&apos;t arrive.
              Change the time or your quiet hours.
            </p>
          )}
          <div className="row-actions">
            <button
              type="button"
              className="text"
              onClick={() => setOpen(true)}
            >
              Change
            </button>
            <button
              type="button"
              className="text"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  toggleReminder(reminder.id, !reminder.paused),
                )
              }
            >
              {reminder.paused ? "Turn back on" : "Pause"}
            </button>
            <button
              type="button"
              className="text danger"
              disabled={pending}
              onClick={() => startTransition(() => removeReminder(reminder.id))}
            >
              Remove
            </button>
          </div>
        </>
      )}
      {!reminder && !open && (
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen(true)}
        >
          Set a reminder
        </button>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveReminder({
                stepId: step.id,
                minuteOfDay: toMinutes(time),
                days,
              });
              if (!r.ok) return setError(r.error ?? "");
              setError("");
              setOpen(false);
            });
          }}
        >
          <div className="field">
            <label htmlFor={"time-" + step.id}>Time</label>
            <input
              id={"time-" + step.id}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <fieldset className="chips">
            <legend>Days</legend>
            {weekdayOptions.map((d) => (
              <label key={d.value} className="chip small">
                <input
                  type="checkbox"
                  checked={days.includes(d.value)}
                  onChange={(e) =>
                    setDays((list) =>
                      e.target.checked
                        ? [...list, d.value]
                        : list.filter((x) => x !== d.value),
                    )
                  }
                />
                <span>{d.label}</span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button disabled={pending}>Save reminder</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export function QuietHours({ start, end }: { start: number; end: number }) {
  const [from, setFrom] = useState(formatMinutes(start));
  const [to, setTo] = useState(formatMinutes(end));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await setQuietHours({
            quietStart: toMinutes(from),
            quietEnd: toMinutes(to),
          });
          setSaved(true);
        });
      }}
    >
      <div className="field">
        <label htmlFor="quiet-from">Quiet from</label>
        <input
          id="quiet-from"
          type="time"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="quiet-to">until</label>
        <input
          id="quiet-to"
          type="time"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      <button className="secondary" disabled={pending}>
        Save quiet hours
      </button>
      {saved && (
        <p className="meta" role="status">
          Saved.
        </p>
      )}
    </form>
  );
}
