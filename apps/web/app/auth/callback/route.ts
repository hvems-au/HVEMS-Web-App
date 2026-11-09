import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPortal } from "@/lib/current-portal";
import { safeRelative } from "@/lib/handoff";
import { PORTAL_INFO, portalOrigin } from "@/lib/portals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes email verification, invitations and password recovery.
 * Supports both the PKCE `code` flow and `token_hash` email templates.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const portal = await getCurrentPortal();
  const next = safeRelative(url.searchParams.get("next"), PORTAL_INFO[portal].home);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "signup" | "email" | "recovery" | "invite" | "email_change" | null;
  const db = await createSupabaseServerClient();

  let ok = false;
  if (code) {
    ok = !(await db.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await db.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const dest = new URL(ok ? (type === "recovery" ? "/reset-password" : next) : "/login?error=link", portalOrigin(portal));
  return NextResponse.redirect(dest);
}
