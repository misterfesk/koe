"use client";
import { useState, useTransition } from "react";
import { useBrowserValue } from "@/components/use-browser";
import { describeDays, formatMinutes, weekdayOptions } from "@/domain/time";
import {
  removeReminder,
  saveReminder,
  sendTestReminder,
  setQuietHours,
  subscribePush,
  toggleReminder,
} from "@/server/actions/settings";
import type { ReminderView } from "@/server/data/reminders";

type Step = { id: string; title: string; repeatDays: number[] | null };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function base64ToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Turns notifications on for this browser. Asked only when someone sets a reminder. */
export function DeviceNotifications({
  publicKey,
  subscribed,
}: {
  publicKey: string | null;
  subscribed: boolean;
}) {
  const [state, setState] = useState<string>("");
  const supported = useBrowserValue(
    () => "serviceWorker" in navigator && "PushManager" in window,
    true,
  );
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
  return (
    <div className="panel">
      <p>
        {subscribed
          ? "Notifications are on for at least one of your devices."
          : "Reminders arrive as notifications. Turn them on for this device."}
      </p>
      <div className="actions">
        <button
          type="button"
          className={subscribed ? "secondary" : undefined}
          onClick={async () => {
            try {
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                return setState(
                  "Notifications are blocked. You can allow them in your browser's site settings.",
                );
              const reg = await navigator.serviceWorker.register("/sw.js");
              await navigator.serviceWorker.ready;
              const sub =
                (await reg.pushManager.getSubscription()) ??
                (await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: base64ToBytes(publicKey),
                }));
              await subscribePush(sub.toJSON());
              setState("Notifications are on for this device.");
            } catch {
              setState("Couldn't turn notifications on here. Try again later.");
            }
          }}
        >
          {subscribed ? "Turn on for this device too" : "Turn on notifications"}
        </button>
        {subscribed && (
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              const r = await sendTestReminder();
              setState(
                r.delivered
                  ? "Test sent. It can take a few seconds."
                  : "Couldn't send a test. Try turning notifications on again.",
              );
            }}
          >
            Send a test
          </button>
        )}
      </div>
      {state && (
        <p className="meta" role="status">
          {state}
        </p>
      )}
    </div>
  );
}

export function ReminderRow({
  step,
  reminder,
  focus,
}: {
  step: Step;
  reminder?: ReminderView;
  focus: boolean;
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
              ? reminder.ignoredCount >= 3
                ? "Paused after a few reminders went unanswered. Turn it back on any time."
                : "Paused"
              : `${formatMinutes(reminder.minuteOfDay)} · ${describeDays(reminder.days)}`}
          </p>
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
