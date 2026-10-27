"use client";
import { useId, useState, useTransition } from "react";
import { formatMinutes } from "@/domain/time";
import {
  remindMe,
  removeReminder,
  toggleReminder,
} from "@/server/actions/settings";
import { enableNotifications, TestNow, useAllowed } from "./notifications";

export type EntryReminder = {
  id: string;
  /** The time as the person's locale writes it. */
  time: string;
  minute: number;
  paused: boolean;
  /** Paused after a few went unanswered. */
  backedOff: boolean;
  /** The time falls inside quiet hours, so it won't arrive. */
  quiet: boolean;
};

export type PushState = { publicKey: string | null; subscribed: boolean };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * A small reminder control for one timed entry. The browser's permission
 * question is asked only here, after one line saying what it is for.
 */
export function RemindControl({
  stepId,
  title,
  minute,
  reminder,
  push,
}: {
  stepId: string;
  title: string;
  minute: number;
  reminder: EntryReminder | null;
  push: PushState;
}) {
  const [mode, setMode] = useState<"idle" | "explain" | "change">("idle");
  const [time, setTime] = useState(formatMinutes(reminder?.minute ?? minute));
  const [error, setError] = useState("");
  const [justOn, setJustOn] = useState(false);
  const [pending, startTransition] = useTransition();
  const allowed = useAllowed();
  const timeId = useId();
  if (!push.publicKey) return null;

  const save = (at?: number, ask = false) =>
    startTransition(async () => {
      setError("");
      if (ask) {
        const r = await enableNotifications(push.publicKey!);
        if (!r.ok) return setError(r.message);
      }
      const r = await remindMe({ stepId, minuteOfDay: at });
      if (!r.ok) return setError(r.error ?? "Couldn't set that reminder.");
      setMode("idle");
      setJustOn(true);
    });

  return (
    <div>
      {reminder && mode !== "change" && (
        <p className="meta">
          {reminder.paused
            ? reminder.backedOff
              ? "Reminder paused after a few went unanswered. "
              : "Reminder paused. "
            : `Reminder at ${reminder.time} · `}
          <button
            type="button"
            className="text"
            disabled={pending}
            aria-label={`Change the reminder for ${title}`}
            onClick={() => setMode("change")}
          >
            Change
          </button>{" "}
          {reminder.paused && (
            <>
              <button
                type="button"
                className="text"
                disabled={pending}
                aria-label={`Turn the reminder back on for ${title}`}
                onClick={() =>
                  startTransition(() => toggleReminder(reminder.id, false))
                }
              >
                Turn back on
              </button>{" "}
            </>
          )}
          <button
            type="button"
            className="text"
            disabled={pending}
            aria-label={`Turn off the reminder for ${title}`}
            onClick={() => {
              setJustOn(false);
              startTransition(() => removeReminder(reminder.id));
            }}
          >
            Off
          </button>
        </p>
      )}
      {reminder?.quiet && !reminder.paused && mode !== "change" && (
        <p className="error">
          That time is inside your quiet hours, so it won&apos;t arrive.
        </p>
      )}
      {!reminder && mode === "idle" && (
        <button
          type="button"
          className="text"
          disabled={pending}
          aria-label={`Remind me about ${title}`}
          onClick={() =>
            allowed && push.subscribed ? save() : setMode("explain")
          }
        >
          Remind me
        </button>
      )}
      {!reminder && mode === "explain" && (
        <div role="group" aria-label={`Reminder for ${title}`}>
          <p className="meta">
            Your browser will ask to show notifications. A reminder shows only
            the time, never what it is.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={pending}
              onClick={() => save(undefined, true)}
            >
              Allow and remind me
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setMode("idle")}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {mode === "change" && (
        <div role="group" aria-label={`Change the reminder for ${title}`}>
          <div className="field">
            <label htmlFor={timeId}>Remind me at</label>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={pending || !time}
              onClick={() => save(toMinutes(time))}
            >
              Save reminder
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setMode("idle")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {justOn && reminder && (
        <div>
          <p className="meta" role="status">
            Reminders are on for this device.
          </p>
          <TestNow className="text" />
        </div>
      )}
    </div>
  );
}
