"use server";
import { redirect } from "next/navigation";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@hvems/validation";
import { fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { currentOrigin, getCurrentPortal } from "@/lib/current-portal";
import { PORTAL_INFO } from "@/lib/portals";
import { lockedMessage, passwordSignIn, recordSignIn } from "@/lib/sign-in-lockout";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

export async function signInAction(_prev: ActionState<{ redirectTo: string }>, form: FormData): Promise<ActionState<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = await createSupabaseServerClient();
  const portal = await getCurrentPortal();
  const res = await passwordSignIn(db, parsed.data.email, parsed.data.password, portal);
  if (!res.ok) {
    // Same message for unknown email and wrong password (no account enumeration).
    const message = res.locked
      ? lockedMessage(res.lockedUntil)
      : res.code === "email_not_confirmed"
        ? "Please confirm your email address first. Check your inbox for the verification link."
        : res.code === "rate_limited"
          ? "Too many attempts. Wait a few minutes and try again."
          : "Email or password is incorrect.";
    return { status: "error", code: res.code, message };
  }
  // The client does a full navigation: an in-action redirect renders the target
  // before the new session cookie is visible to it, which shows the login page again.
  return { status: "success", data: { redirectTo: safeNext(form.get("next"), PORTAL_INFO[portal].home) } };
}

export async function signUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: form.get("fullName"),
    email: form.get("email"),
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
    acceptTerms: form.get("acceptTerms") === "on",
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = await createSupabaseServerClient();
  const next = safeNext(form.get("next"), "/onboarding");
  const { error } = await db.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await currentOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    const message =
      error.code === "weak_password"
        ? "That password is too easy to guess. Choose a longer or less common password."
        : error.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : "We couldn't create your account. Please try again.";
    return { status: "error", code: error.code ?? "sign_up_failed", message };
  }
  redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function forgotPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Enter a valid email address.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = await createSupabaseServerClient();
  await db.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await currentOrigin()}/auth/callback?next=/reset-password`,
  });
  // Always the same response, whether or not the address has an account.
  return { status: "success", message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = await createSupabaseServerClient();
  const { data: updated, error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      code: error.code ?? "reset_failed",
      message: error.code === "same_password" ? "Choose a password you haven't used here before." : "Your reset link has expired. Request a new one.",
    };
  }
  // A new password unlocks an account locked by wrong passwords.
  if (updated.user?.email) await recordSignIn(updated.user.email, true, await getCurrentPortal()).catch(() => undefined);
  const home = PORTAL_INFO[await getCurrentPortal()].home;
  redirect(home === "/select-context" ? "/select-context?reset=1" : home);
}
