import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPortal } from "@/lib/current-portal";
import { safeRelative, verifyHandoff } from "@/lib/handoff";
import { PORTAL_INFO, portalOrigin } from "@/lib/portals";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Step 2 of a portal switch: redeem the handoff on the target portal. The
 * token must be signed, unexpired (60 s), addressed to this portal, and its
 * inner Supabase token is single use. The new session is this portal's own
 * (host-only cookie). If the portal's MFA rule applies, the layouts ask for
 * MFA as usual, since a handoff session starts at aal1.
 */
export async function GET(request: NextRequest) {
  const portal = await getCurrentPortal();
  // Build redirects from the portal origin; request.nextUrl.origin is not the requested host here.
  const origin = portalOrigin(portal);
  const fail = NextResponse.redirect(new URL("/login?error=link", origin));
  const payload = verifyHandoff(request.nextUrl.searchParams.get("t") ?? "", portal);
  if (!payload) return fail;

  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.verifyOtp({ type: "email", token_hash: payload.th });
  if (error || data.user?.id !== payload.sub) {
    await db.auth.signOut({ scope: "local" });
    return fail;
  }
  await createSupabaseAdminClient().from("security_events").insert({
    user_id: payload.sub,
    event_type: "portal_switch_completed",
    detail: { to: portal },
  });

  const res = NextResponse.redirect(new URL(safeRelative(request.nextUrl.searchParams.get("next"), PORTAL_INFO[portal].home), origin));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const dynamic = "force-dynamic";
