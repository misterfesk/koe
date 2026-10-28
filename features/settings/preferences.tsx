"use client";
import { useActionState, useState, useTransition } from "react";
import { regionOptions } from "@/fixtures/help-resources";
import { createAccount, signOut } from "@/server/actions/account";
import {
  deleteAccount,
  setAppearance,
  setPlace,
  setPrivacy,
  unsubscribePush,
} from "@/server/actions/settings";
import { CredentialsForm } from "../account/credentials";
import { clearOwnerDrafts } from "../today/draft-store";

type Tone = "expressive" | "calm" | "plain";

export function Appearance({
  tone,
  plain,
  reducedMotion,
  mascot,
}: {
  tone: Tone;
  plain: boolean;
  reducedMotion: boolean;
  mascot: boolean;
}) {
  const [, startTransition] = useTransition();
  const set = (v: Parameters<typeof setAppearance>[0]) =>
    startTransition(() => setAppearance(v));
  return (
    <>
      <fieldset className="chips">
        <legend>Koe&apos;s voice</legend>
        {(
          [
            ["expressive", "Warm"],
            ["calm", "Calm"],
            ["plain", "Plain"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={tone === value}
            onClick={() => set({ tone: value })}
          >
            {label}
          </button>
        ))}
        <p className="meta">
          Warm adds encouragement at good moments. Koe is always calm after
          setbacks and in Help.
        </p>
      </fieldset>
      <label className="toggle">
        <input
          type="checkbox"
          checked={plain}
          onChange={(e) => set({ plain: e.target.checked })}
        />
        <span>Plain view: fewer colours and decorations</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => set({ reducedMotion: e.target.checked })}
        />
        <span>Reduce motion</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={mascot}
          onChange={(e) => set({ mascot: e.target.checked })}
        />
        <span>Show the Koe mascot in the header</span>
      </label>
    </>
  );
}

export function Place({
  region,
  timezone,
}: {
  region: string;
  timezone: string;
}) {
  const [r, setR] = useState(region);
  const [tz, setTz] = useState(timezone);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [timezone];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await setPlace({ region: r, timezone: tz });
          setSaved(true);
        });
      }}
    >
      <div className="field">
        <label htmlFor="place-region">Country / region</label>
        <p className="hint">Sets which phone numbers Help shows.</p>
        <select
          id="place-region"
          value={r}
          onChange={(e) => {
            setR(e.target.value);
            setSaved(false);
          }}
        >
          {regionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="place-tz">Timezone</label>
        <p className="hint">
          Sets when your day starts and when reminders arrive.
        </p>
        <select
          id="place-tz"
          value={tz}
          onChange={(e) => {
            setTz(e.target.value);
            setSaved(false);
          }}
        >
          {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="actions">
        <button className="secondary" disabled={pending}>
          Save
        </button>
        {saved && (
          <p className="meta" role="status">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function Transcripts({ keep }: { keep: boolean }) {
  const [, startTransition] = useTransition();
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={keep}
        onChange={(e) =>
          startTransition(() =>
            setPrivacy({ keepTranscripts: e.target.checked }),
          )
        }
      />
      <span>
        Keep chat history.{" "}
        {keep
          ? "Conversations stay until you delete them."
          : "Conversations are deleted a day after they end."}
      </span>
    </label>
  );
}

export function GuestAccount() {
  return (
    <CredentialsForm
      action={createAccount}
      submitLabel="Create account"
      newPassword
    />
  );
}

/** Signing out also stops this device getting the account's reminders. */
export function SignOut() {
  return (
    <form
      action={async () => {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            await unsubscribePush(sub.endpoint);
            await sub.unsubscribe();
          }
        } catch {
          // Sign out regardless.
        }
        await signOut();
      }}
    >
      <button className="secondary">Sign out</button>
    </form>
  );
}

export function DeleteEverything({
  guest,
  owner,
}: {
  guest: boolean;
  owner: string;
}) {
  const [state, action, pending] = useActionState(
    async (_: unknown, form: FormData) => {
      try {
        const result = await deleteAccount(String(form.get("confirm") ?? ""));
        if (!result.ok)
          return {
            ok: false,
            error:
              "Type DELETE to confirm, or leave this page to keep everything.",
          };
        try {
          clearOwnerDrafts(sessionStorage, owner);
        } catch {
          /* Storage may be blocked. */
        }
        // A full navigation clears the deleted account's in-memory client state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/?deleted=1");
        return { ...result, error: "" };
      } catch {
        return {
          ok: false,
          error:
            "Deletion could not be confirmed. Your drafts are kept. Reload before trying again.",
        };
      }
    },
    null,
  );
  return (
    <form action={action} className="panel">
      <h3>Delete everything</h3>
      <p>
        This permanently deletes your {guest ? "guest session" : "account"}.
        Your saved information, plans, notes, conversations, people, reminders
        and Shelf picks are deleted. It can&apos;t be undone. Export first if
        you want a copy.
      </p>
      <div className="field">
        <label htmlFor="confirm-delete">Type DELETE to confirm</label>
        <input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          aria-invalid={state?.ok === false}
          aria-describedby={state?.ok === false ? "confirm-error" : undefined}
        />
        {state?.ok === false && (
          <p id="confirm-error" className="error" role="alert">
            {state.error}
          </p>
        )}
      </div>
      <button className="danger" disabled={pending}>
        Delete everything
      </button>
    </form>
  );
}
