import "server-only";
import { AppError, toAppError } from "@hvems/api-client";
import type { z } from "zod";

export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; code: string; message: string; fieldErrors?: Record<string, string> };

export const idle: ActionState = { status: "idle" };

/** Friendly copy for database error codes raised through app.raise(). */
const MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  not_authenticated: "Please sign in again.",
  mfa_required: "This action needs multi-factor authentication. Set it up under Account security.",
  member_limit_reached: "Companies with five or fewer assets can have up to five member logins. Operator profiles are unlimited.",
  fleet_consent_required:
    "Adding more than five assets needs the Owner or a Finance member to agree to the fleet subscription ($30 per asset above five, per month) and add a payment method.",
  account_restricted: "This account is restricted for non-payment. Safety functions keep working.",
};

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function errorState(err: unknown): ActionState<never> {
  const e = err instanceof AppError ? err : toAppError(err as Error);
  const fieldErrors: Record<string, string> = {};
  const errors = e.details?.errors;
  if (Array.isArray(errors)) {
    for (const item of errors as { field?: string; message?: string }[]) {
      if (item.field && item.message && !fieldErrors[item.field]) fieldErrors[item.field] = item.message;
    }
  }
  return {
    status: "error",
    code: e.code,
    message: MESSAGES[e.code] ?? e.message,
    ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
  };
}
