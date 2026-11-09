import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminHost } from "./lib/admin-host";

/**
 * Runs before every page request:
 *  1. Administration console isolation (SoW §2.3: "a separate address"):
 *     /admin is only served on ADMIN_HOST; the admin host serves nothing else
 *     except the shared sign-in routes.
 *  2. Refreshes the Supabase session cookie.
 *  3. Sends signed-out visitors of protected areas to /login.
 * Authorisation itself is enforced by the database (RLS) and server layouts.
 */
const PUBLIC_PREFIXES = ["/login", "/sign-up", "/forgot-password", "/reset-password", "/check-email", "/auth", "/invite"];
const PROTECTED_PREFIXES = ["/customer", "/provider", "/admin", "/onboarding", "/select-context", "/account"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const onAdminHost = isAdminHost(host);

  if (pathname.startsWith("/admin") && !onAdminHost) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Staff accounts are provisioned by HVEMS, never self-registered on the admin host.
  if (onAdminHost && pathname.startsWith("/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (onAdminHost && !pathname.startsWith("/admin") && !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) && pathname !== "/account/security") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Validates the JWT signature/claims; do not trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = onAdminHost ? "/admin" : "/select-context";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
