"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useBrowserValue } from "@/components/use-browser";
import { regionOptions } from "@/fixtures/help-resources";
import { start } from "@/server/actions/account";

/** Region from the browser locale, e.g. "en-GB" → "GB", if Koe lists it. */
function guessRegion() {
  const tags = [...(navigator.languages ?? []), navigator.language];
  for (const tag of tags) {
    const region = tag?.split("-")[1]?.toUpperCase();
    if (region && regionOptions.some((o) => o.value === region)) return region;
  }
  return "OTHER";
}

export function StartForm() {
  const [state, action, pending] = useActionState(start, null);
  const detected = useBrowserValue(guessRegion, "OTHER");
  const timezone = useBrowserValue(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    "UTC",
  );
  const [chosen, setRegion] = useState<string | null>(null);
  const region = chosen ?? detected;
  const errors = state && !state.ok ? state.errors : {};
  return (
    <form action={action} className="prose" noValidate>
      <p>
        Koe is an AI companion that helps you plan gentle days. It&apos;s not a
        therapist, and it can&apos;t respond to emergencies.{" "}
        <Link href="/help">Get help now</Link>.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          name="adult"
          value="yes"
          aria-invalid={!!errors.adult}
          aria-describedby={errors.adult ? "adult-error" : undefined}
        />
        <span>I&apos;m 18 or older</span>
      </label>
      {errors.adult && (
        <p id="adult-error" className="error" role="alert">
          {errors.adult}
        </p>
      )}
      <div className="field">
        <label htmlFor="region">Where are you?</label>
        <p className="hint" id="region-hint">
          So Help shows the right phone numbers. You can change it later.
        </p>
        <select
          id="region"
          name="region"
          aria-describedby="region-hint"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {regionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="timezone" value={timezone} />
      <p className="meta">
        Times use your device&apos;s timezone ({timezone}).
      </p>
      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start"}
        </button>
      </div>
      <p className="meta">
        You start as a guest. What you write is saved encrypted on Koe&apos;s
        server and linked to this browser. Make an account in You so you
        don&apos;t lose it if you clear your browser or change devices.
      </p>
    </form>
  );
}
