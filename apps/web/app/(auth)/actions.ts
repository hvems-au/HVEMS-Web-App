"use server";
import { redirect } from "next/navigation";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@hvems/validation";
import { fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

export async function signInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = await createSupabaseServerClient();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password (no account enumeration).
    const message =
      error.code === "email_not_confirmed"
        ? "Please confirm your email address first. Check your inbox for the verification link."
        : error.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : "Email or password is incorrect.";
    return { status: "error", code: error.code ?? "sign_in_failed", message };
  }
  redirect(safeNext(form.get("next"), "/select-context"));
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
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
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
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });
  // Always the same response, whether or not the address has an account.
  return { status: "success", message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = await createSupabaseServerClient();
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      code: error.code ?? "reset_failed",
      message: error.code === "same_password" ? "Choose a password you haven't used here before." : "Your reset link has expired. Request a new one.",
    };
  }
  redirect("/select-context?reset=1");
}
