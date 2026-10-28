"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import type { CredentialResult } from "@/server/actions/account";
import { transferOwnerDrafts } from "../today/draft-store";

type Action = (state: unknown, form: FormData) => Promise<CredentialResult>;
const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/** Email and password form shared by "Sign in" and "Create an account". */
export function CredentialsForm({
  action,
  submitLabel,
  newPassword = false,
}: {
  action: Action;
  submitLabel: string;
  newPassword?: boolean;
}) {
  const browser = useSyncExternalStore(
    subscribe,
    browserSnapshot,
    serverSnapshot,
  );
  const [state, formAction, pending] = useActionState(
    async (state: unknown, form: FormData) => {
      const result = await action(state, form);
      if (result.ok && result.redirectTo) {
        try {
          if (result.transferredDrafts)
            transferOwnerDrafts(
              sessionStorage,
              result.transferredDrafts.from,
              result.transferredDrafts.to,
            );
        } catch {
          /* Blocked storage does not block sign-in. */
        }
        window.location.assign(result.redirectTo);
      }
      return result;
    },
    null,
  );
  // Controlled, so a failed attempt doesn't wipe what was typed.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const errors = state && !state.ok ? state.errors : {};
  return (
    <form action={formAction} className="prose" noValidate>
      <input
        type="hidden"
        name="draftHandoff"
        value={browser ? "browser" : ""}
      />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email && (
          <p id="email-error" className="error" role="alert">
            {errors.email}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        {newPassword && (
          <p className="hint" id="password-hint">
            At least 10 characters. Try a short phrase you can remember.
          </p>
        )}
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={newPassword ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={
            errors.password
              ? "password-error"
              : newPassword
                ? "password-hint"
                : undefined
          }
        />
        {errors.password && (
          <p id="password-error" className="error" role="alert">
            {errors.password}
          </p>
        )}
      </div>
      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "One moment…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
