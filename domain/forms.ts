import type { z } from "zod";
import type { RiskLevel } from "./safety";

export type FieldErrors = Record<string, string>;

/** What a server action hands back to a form. */
export type ActionResult<T = object> =
  ({ ok: true; safety?: RiskLevel } & T) | { ok: false; errors: FieldErrors };

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
