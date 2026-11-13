import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVITY_COOKIE, encodeActivity, IDLE_DEFAULT_MINUTES, IDLE_LIMIT_COOKIE, isIdleExpired, parseActivity } from "./lib/idle";
import { AUTH_PREFIXES, PORTAL_INFO, portalForHost, portalOrigin, startsWithAny, type PortalId } from "./lib/portals";

/**
 * Runs before every page request (ADR-009):
 *  1. Picks the portal from the host. Each portal serves only its own routes,
 *     so /admin exists only on the Super Admin host, /provider only on the
 *     provider host, and so on. Unknown hosts get 404 (in development, plain
 *     localhost is sent to the company portal).
 *  2. Refreshes that portal's Supabase session cookie. Cookies are host-only,
 *     so a session on one portal is never sent to another.
 *  3. Signs out a session idle for longer than the portal's limit (settings:
 *     portals 3 h, console 30 min).
 *  4. Sends signed-out visitors of protected areas to the portal's /login.
 * Authorisation itself is enforced by the database (RLS) and server layouts.
 */
function redirectTo(request: NextRequest, pathname: string, keepQuery = false) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  if (!keepQuery) url.search = "";
  return NextResponse.redirect(url);
}

// Idle limits are platform settings; read at most once a minute per server instance.
let idleCache: { at: number; portal: number; console: number; operator: number } | null = null;
type SettingsReader = { from(t: "platform_settings"): { select(c: string): { in(k: string, v: string[]): PromiseLike<{ data: { key: string; value: unknown }[] | null }> } } };
async function idleLimitMinutes(db: SettingsReader, portal: PortalId, operatorView: boolean): Promise<number> {
  if (!idleCache || Date.now() - idleCache.at > 60_000) {
    const { data } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", ["security.idle_timeout_minutes_portal", "security.idle_timeout_minutes_console", "security.idle_timeout_minutes_operator"]);
    const get = (k: string, d: number) => {
      const v = Number(data?.find((r) => r.key === k)?.value);
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    idleCache = {
      at: Date.now(),
      portal: get("security.idle_timeout_minutes_portal", IDLE_DEFAULT_MINUTES.portal),
      console: get("security.idle_timeout_minutes_console", IDLE_DEFAULT_MINUTES.console),
      operator: get("security.idle_timeout_minutes_operator", IDLE_DEFAULT_MINUTES.operator),
    };
  }
  // Operator screens time out sooner: site tablets are shared.
  return portal === "admin" ? idleCache.console : operatorView ? idleCache.operator : idleCache.portal;
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

  // The old operator address only redirects to the company portal (same path), so
  // printed QR labels and bookmarks keep working.
  if (portal === "driver") {
    const target = startsWithAny(pathname, ["/driver"]) ? pathname : "/driver";
    return NextResponse.redirect(new URL(target + request.nextUrl.search, portalOrigin("company")), 308);
  }
  const operatorView = startsWithAny(pathname, ["/driver"]);

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

  if (signedIn) {
    const sessionId = String(data?.claims?.session_id ?? data?.claims?.sub);
    const now = Math.floor(Date.now() / 1000);
    const limit = await idleLimitMinutes(supabase as unknown as SettingsReader, portal, operatorView);
    if (isIdleExpired(parseActivity(request.cookies.get(ACTIVITY_COOKIE)?.value), sessionId, now, limit)) {
      await supabase.auth.signOut({ scope: "local" });
      const url = request.nextUrl.clone();
      url.pathname = operatorView ? "/driver" : "/login";
      url.search = operatorView ? "" : "?reason=idle";
      const out = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
      out.cookies.delete(ACTIVITY_COOKIE);
      return out;
    }
    const secure = request.nextUrl.protocol === "https:";
    response.cookies.set(ACTIVITY_COOKIE, encodeActivity(sessionId, now), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 30 * 86400 });
    response.cookies.set(IDLE_LIMIT_COOKIE, String(limit), { sameSite: "lax", secure, path: "/", maxAge: 30 * 86400 });
  }

  // Operator screens never send people to /login: signed out in the operator
  // workspace, they sign in on /driver and come back to the exact page (layouts
  // can't see the full path, so this happens here).
  if (operatorView) {
    if (!signedIn && pathname.startsWith("/driver/o/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/driver";
      url.search = "";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      const out = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
      return out;
    }
    return response;
  }

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
