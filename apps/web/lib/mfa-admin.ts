import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Remove every MFA factor (authenticator app) from a user, so they can set up
 * a new one. Call this only with a user id the database has just approved: a
 * spent recovery code (use_mfa_recovery_code) or an authorised reset
 * (reset_member_mfa, admin_reset_user_mfa). The database makes the decision
 * and records it; this only carries it out in Supabase Auth.
 */
export async function removeAllMfaFactors(userId: string): Promise<number> {
  const admin = createSupabaseAdminClient().auth.admin.mfa;
  const { data, error } = await admin.listFactors({ userId });
  if (error) throw error;
  const factors = data?.factors ?? [];
  for (const f of factors) {
    const { error: e } = await admin.deleteFactor({ id: f.id, userId });
    if (e) throw e;
  }
  return factors.length;
}
