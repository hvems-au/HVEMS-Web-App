import { NextResponse } from "next/server";
import { getCurrentPortal } from "@/lib/current-portal";
import { portalOrigin } from "@/lib/portals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Signs out of this portal only; sessions in other portals are separate (ADR-009). */
export async function POST() {
  const [db, portal] = await Promise.all([createSupabaseServerClient(), getCurrentPortal()]);
  await db.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", portalOrigin(portal)), { status: 303 });
}
