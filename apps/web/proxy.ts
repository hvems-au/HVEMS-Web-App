import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PREFIXES, PORTAL_INFO, portalForHost, portalOrigin, startsWithAny } from "./lib/portals";

/**
 * Runs before every page request (ADR-009):
 *  1. Picks the portal from the host. Each portal serves only its own routes,
 *     so /admin exists only on the Super Admin host, /provider only on the
 *     provider host, and so on. Unknown hosts get 404 (in development, plain
 *     localhost is sent to the company portal).
 *  2. Refreshes that portal's Supabase session cookie. Cookies are host-only,
 *     so a session on one portal is never sent to another.
 *  3. Sends signed-out visitors of protected areas to the portal's /login.
 * Authorisation itself is enforced by the database (RLS) and server layouts.
 */
function redirectTo(request: NextRequest, pathname: string, keepQuery = false) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  if (!keepQuery) url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const portal = portalForHost(host);

  if (!portal) {
    if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, portalOrigin("company")));
    }
    return new NextResponse("Not found", { status: 404 });
  }

  const info = PORTAL_INFO[portal];

  // Driver portal: equipment code + Driver ID + PIN only. No email sign-in.
  if (portal === "driver") {
    return startsWithAny(pathname, info.prefixes) ? NextResponse.next() : redirectTo(request, info.home);
  }

  if (pathname !== "/" && !startsWithAny(pathname, AUTH_PREFIXES) && !startsWithAny(pathname, info.prefixes)) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Staff are provisioned by HVEMS; drivers by their company. No self sign-up there.
  if (!info.signUp && startsWithAny(pathname, ["/sign-up"])) return redirectTo(request, "/login");

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

  if (!signedIn && startsWithAny(pathname, info.prefixes)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/sign-up")) return redirectTo(request, info.home);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
