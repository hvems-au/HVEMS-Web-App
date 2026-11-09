import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const db = await createSupabaseServerClient();
  await db.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
