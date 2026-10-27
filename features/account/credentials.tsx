"use client";
import { useActionState, useState } from "react";
import type { ActionResult } from "@/domain/forms";

type Action = (state: unknown, form: FormData) => Promise<ActionResult>;

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
  const [state, formAction, pending] = useActionState(action, null);
  // Controlled, so a failed attempt doesn't wipe what was typed.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const errors = state && !state.ok ? state.errors : {};
  return (
    <form action={formAction} className="prose" noValidate>
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
            At least 10 characters. A few words together works well.
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
