/**
 * HVEMS portals (ADR-009). One Next.js app serves five separate sign-in
 * portals, chosen by the request host:
 *
 *   admin     Super Admin console (HVEMS staff only)
 *   company   company organisations; companies also reach the marketplace here
 *   market    marketplace-only customers (post jobs without a fleet)
 *   provider  service providers
 *   driver    drivers: equipment code + Driver ID + PIN (increment 2B)
 *
 * Supabase session cookies are host-only, so each portal has its own session
 * (spec §2.5 "separate sessions"); moving between portals uses a single-use
 * handoff (app/auth/handoff). Safe for the proxy (no server-only imports).
 */
import type { OrganisationKind } from "@hvems/permissions";

export const PORTALS = ["admin", "company", "market", "provider", "driver"] as const;
export type PortalId = (typeof PORTALS)[number];

const DEFAULT_HOSTS: Record<PortalId, string> = {
  admin: "admin.localhost:3000",
  company: "company.localhost:3000",
  market: "market.localhost:3000",
  provider: "provider.localhost:3000",
  driver: "driver.localhost:3000",
};

const ENV_KEYS: Record<PortalId, string> = {
  admin: "ADMIN_HOST",
  company: "COMPANY_HOST",
  market: "MARKET_HOST",
  provider: "PROVIDER_HOST",
  driver: "DRIVER_HOST",
};

export function portalHost(portal: PortalId): string {
  return (process.env[ENV_KEYS[portal]] || DEFAULT_HOSTS[portal]).toLowerCase();
}

export function portalForHost(host: string | null | undefined): PortalId | null {
  if (!host) return null;
  const h = host.toLowerCase();
  return PORTALS.find((p) => portalHost(p) === h) ?? null;
}

/** Local development hosts use http; everything else https. */
export function portalOrigin(portal: PortalId): string {
  const host = portalHost(portal);
  const local = /^(?:[a-z0-9-]+\.)*localhost(?::\d+)?$/.test(host) || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}`;
}

/** The live driver portal, printed on equipment labels while testing locally. */
export const LIVE_DRIVER_URL = "https://driver.hvems.com.au";

/**
 * The driver portal address printed on QR labels. Labels outlive test builds,
 * so a local development host is never printed: the live address is used instead.
 */
export function printedDriverUrl(): string {
  const origin = portalOrigin("driver");
  return origin.startsWith("http://") ? LIVE_DRIVER_URL : origin;
}

/** Which portal an organisation of each kind is used in. */
export const PORTAL_FOR_ORG_KIND: Record<OrganisationKind, Extract<PortalId, "company" | "market" | "provider">> = {
  company: "company",
  marketplace_customer: "market",
  provider: "provider",
};

export interface PortalInfo {
  name: string;
  loginTitle: string;
  loginSubtitle: string;
  /** Organisation kinds served; empty for the console and the driver portal. */
  orgKinds: readonly OrganisationKind[];
  /** Self-service sign-up offered on this portal. */
  signUp: boolean;
  /** URL prefixes this portal serves, besides the shared public routes. */
  prefixes: readonly string[];
  home: string;
}

export const PORTAL_INFO: Record<PortalId, PortalInfo> = {
  admin: {
    name: "Super Admin console",
    loginTitle: "Administrator Login",
    loginSubtitle: "HVEMS staff access to the platform administration console.",
    orgKinds: [],
    signUp: false,
    prefixes: ["/admin", "/account/security"],
    home: "/admin",
  },
  company: {
    name: "Company portal",
    loginTitle: "Company Login",
    loginSubtitle: "Manage your equipment, inspections, defects, maintenance, team and marketplace jobs.",
    orgKinds: ["company"],
    signUp: true,
    prefixes: ["/customer", "/onboarding", "/select-context", "/account"],
    home: "/select-context",
  },
  market: {
    name: "Marketplace",
    loginTitle: "Marketplace Login",
    loginSubtitle: "Post a job and engage verified providers. No fleet subscription needed.",
    orgKinds: ["marketplace_customer"],
    signUp: true,
    prefixes: ["/customer", "/onboarding", "/select-context", "/account"],
    home: "/select-context",
  },
  provider: {
    name: "Provider portal",
    loginTitle: "Provider Login",
    loginSubtitle: "Find jobs, submit proposals and manage your engagements.",
    orgKinds: ["provider"],
    signUp: true,
    prefixes: ["/provider", "/onboarding", "/select-context", "/account"],
    home: "/select-context",
  },
  driver: {
    name: "Operator sign-in",
    loginTitle: "Operator Sign-in",
    loginSubtitle: "Scan the code on the vehicle or machine, then enter your Operator ID and PIN.",
    orgKinds: [],
    signUp: false,
    prefixes: ["/driver"],
    home: "/driver",
  },
};

/** Routes every portal except the driver portal serves (sign-in, recovery, callbacks). */
export const AUTH_PREFIXES = ["/login", "/sign-up", "/forgot-password", "/reset-password", "/check-email", "/auth", "/invite"] as const;

export function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
