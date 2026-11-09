"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { HvemsClient } from "@hvems/api-client";

let client: HvemsClient | undefined;

/** Browser Supabase client (publishable key, user session). Used for MFA enrolment and realtime later. */
export function getSupabaseBrowserClient(): HvemsClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ) as unknown as HvemsClient;
  return client;
}
