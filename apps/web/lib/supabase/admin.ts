import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Service client using the Supabase secret key. Server-only, and used only
 * for the narrow tasks the user's own session can't do: issuing a portal
 * handoff link for the signed-in user and writing security events. Never
 * import it into client components or use it for ordinary data access.
 */
export function createSupabaseAdminClient(extraHeaders?: Record<string, string>): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(extraHeaders ? { global: { headers: extraHeaders } } : {}),
  });
}
