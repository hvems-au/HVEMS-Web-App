"use server";
import { redeemMfaRecoveryCode } from "@hvems/api-client";
import { errorState, type ActionState } from "@/lib/actions";
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
