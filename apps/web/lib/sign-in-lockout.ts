import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Password lockout (SoW §2.5, CFG-45): 10 wrong passwords in a row lock the
 * address for 15 minutes (settings `security.password_*`). The counting and
 * the lock live in the database; these functions are server-only (service
 * role), so a browser can neither read nor clear a lock.
 */
export interface LockState {
  locked: boolean;
  locked_until?: string | null;
  remaining?: number;
}

export async function signInLockState(email: string): Promise<LockState> {
  const { data, error } = await createSupabaseAdminClient().rpc("password_sign_in_status", { p_email: email });
  if (error) throw error;
  return (data ?? { locked: false }) as LockState;
}

export async function recordSignIn(email: string, success: boolean, portal: string): Promise<LockState> {
  const { data, error } = await createSupabaseAdminClient().rpc("record_password_sign_in", { p_email: email, p_success: success, p_portal: portal });
  if (error) throw error;
  return (data ?? { locked: false }) as LockState;
}

/** "Too many wrong passwords…" with the Brisbane-time unlock, e.g. "after 3:42 pm". */
export function lockedMessage(until: string | null | undefined): string {
  const time = until
    ? new Date(until).toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" })
    : null;
  return `Too many wrong passwords, so this account is locked${time ? ` until ${time} (Brisbane time)` : " for a few minutes"}. Try again later or reset your password.`;
}

type AuthClient = { auth: { signInWithPassword(c: { email: string; password: string }): Promise<{ error: { code?: string; status?: number } | null }> } };

export type PasswordSignInResult = { ok: true } | { ok: false; code: string; locked?: boolean; lockedUntil?: string | null };

/**
 * Password sign-in with the lockout around it. A locked address is refused
 * before the password is checked; a wrong password is counted; a successful
 * sign-in clears the count. If the lockout check itself is unavailable the
 * sign-in still proceeds (Supabase Auth's own rate limits still apply), so an
 * outage of this check never locks everyone out.
 */
export async function passwordSignIn(db: AuthClient, email: string, password: string, portal: string): Promise<PasswordSignInResult> {
  const before = await signInLockState(email).catch((e) => {
    console.error("lockout check failed", e);
    return { locked: false } as LockState;
  });
  if (before.locked) return { ok: false, code: "account_locked", locked: true, lockedUntil: before.locked_until };

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") {
      const after = await recordSignIn(email, false, portal).catch(() => null);
      if (after?.locked) return { ok: false, code: "account_locked", locked: true, lockedUntil: after.locked_until };
    }
    return { ok: false, code: error.status === 429 ? "rate_limited" : (error.code ?? "sign_in_failed") };
  }
  await recordSignIn(email, true, portal).catch((e) => console.error("lockout clear failed", e));
  return { ok: true };
}
