"use server";
import { redeemMfaRecoveryCode } from "@hvems/api-client";
import { createClient } from "@supabase/supabase-js";
import { resetPasswordSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { getCurrentPortal } from "@/lib/current-portal";
import { publicEnv } from "@/lib/env";
import { auditContextHeaders } from "@/lib/request-context";
import { lockedMessage, passwordSignIn, wrongPasswordMessage } from "@/lib/sign-in-lockout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { removeAllMfaFactors } from "@/lib/mfa-admin";
import { getSessionUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Spend one recovery code (lost or replaced phone). The database checks the
 * code, counts wrong attempts and records the event; only when it says ok are
 * the person's own authenticators removed, so they can set up a new one.
 */
export async function redeemRecoveryCodeAction(code: string): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { status: "error", code: "not_authenticated", message: "Please sign in again." };
  const trimmed = code.trim();
  if (trimmed.length < 10 || trimmed.length > 20) {
    return { status: "error", code: "invalid", message: "Enter the 10-character recovery code, for example ABCDE-23456." };
  }
  try {
    const db = await createSupabaseServerClient();
    const res = await redeemMfaRecoveryCode(db, trimmed);
    if (!res.ok) return { status: "error", code: res.code, message: res.message };
    if (res.user_id !== user.id) return { status: "error", code: "forbidden", message: "Please sign in again." };
    await removeAllMfaFactors(user.id);
    return { status: "success", message: "Recovery code accepted. Set up your authenticator app again." };
  } catch (e) {
    return errorState(e);
  }
}

/**
 * Change password (every user). The current password is checked on a separate,
 * throw-away session (so the person's MFA session isn't replaced) and counts
 * towards the lockout like any sign-in. The new password follows the same
 * policy as sign-up (at least 10 characters).
 */
export async function changePasswordAction(input: { current: string; password: string; confirmPassword: string }): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user?.email) return { status: "error", code: "not_authenticated", message: "Please sign in again." };
  if (!input.current) return { status: "error", code: "invalid", message: "Enter your current password.", fieldErrors: { current: "Enter your current password" } };
  const parsed = resetPasswordSchema.safeParse({ password: input.password, confirmPassword: input.confirmPassword });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  if (input.current === parsed.data.password) {
    return { status: "error", code: "same_password", message: "Choose a password different from your current one.", fieldErrors: { password: "Choose a different password" } };
  }
  try {
    const check = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const verified = await passwordSignIn(check, user.email, input.current, await getCurrentPortal());
    if (!verified.ok) {
      return verified.locked
        ? { status: "error", code: "account_locked", message: lockedMessage(verified.lockedUntil) }
        : { status: "error", code: "invalid_credentials", message: wrongPasswordMessage("Your current password is not right.", verified), fieldErrors: { current: "Not right" } };
    }
    await check.auth.signOut({ scope: "local" });

    const db = await createSupabaseServerClient();
    const { error } = await db.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return {
        status: "error",
        code: error.code ?? "password_change_failed",
        message: error.code === "same_password" ? "Choose a password you haven't used here before." : error.code === "weak_password" ? "That password is too easy to guess. Choose another." : "Your password couldn't be changed. Please try again.",
      };
    }
    await createSupabaseAdminClient(await auditContextHeaders())
      .from("security_events")
      .insert({ user_id: user.id, event_type: "password_changed", detail: {} });
    return { status: "success", message: "Password changed." };
  } catch (e) {
    return errorState(e);
  }
}
