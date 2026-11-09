import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPortal } from "@/lib/current-portal";
import { safeRelative, signHandoff } from "@/lib/handoff";
import { portalOrigin, type PortalId } from "@/lib/portals";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Portals a person can hand off between. The console and driver portal never take part. */
const SWITCHABLE: readonly PortalId[] = ["company", "market", "provider"];

/**
 * Step 1 of a portal switch (spec §2.7): issue a single-use handoff for the
 * signed-in person and send them to the target portal, which creates its own
 * session. The identity comes only from this portal's verified session.
 */
export async function GET(request: NextRequest) {
  const current = await getCurrentPortal();
  const to = request.nextUrl.searchParams.get("to") as PortalId | null;
  const next = safeRelative(request.nextUrl.searchParams.get("next"), "/select-context");
  if (!to || !SWITCHABLE.includes(to) || !SWITCHABLE.includes(current) || to === current) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getClaims();
  const sub = data?.claims?.sub;
  const email = data?.claims?.email;
  if (!sub || typeof email !== "string") {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, portalOrigin(current)));
  }

  const admin = createSupabaseAdminClient();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token || link.user?.id !== sub) {
    return NextResponse.redirect(new URL("/select-context?switch=failed", portalOrigin(current)));
  }
  await admin.from("security_events").insert({
    user_id: sub,
    event_type: "portal_switch_started",
    detail: { from: current, to },
  });

  const token = signHandoff({ th: link.properties.hashed_token, to, sub });
  const target = new URL("/auth/handoff", portalOrigin(to));
  target.searchParams.set("t", token);
  target.searchParams.set("next", next);
  const res = NextResponse.redirect(target);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const dynamic = "force-dynamic";
