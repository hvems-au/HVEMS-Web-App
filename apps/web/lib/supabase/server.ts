import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { HvemsClient } from "@hvems/api-client";
import { publicEnv } from "@/lib/env";
import { auditContextHeaders } from "@/lib/request-context";

/**
 * Supabase client acting as the signed-in user (publishable key + session
 * cookie). Every query runs under RLS. The secret key is never used here.
 */
export async function createSupabaseServerClient(): Promise<HvemsClient> {
  const [cookieStore, context] = await Promise.all([cookies(), auditContextHeaders()]);
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    // Portal, IP and browser for the audit record (AUD-01).
    global: { headers: context },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  }) as unknown as HvemsClient;
}
