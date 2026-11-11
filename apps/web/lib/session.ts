import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getMyCapabilities, getMyContexts, getMyStaffContext } from "@hvems/api-client";
import type { Capability, OrganisationKind } from "@hvems/permissions";
import { BUSINESS_TIMEZONE } from "@hvems/domain";
import type { MyContext } from "@hvems/types";
import { getCurrentPortal, portalPathFor, portalServesContext } from "@/lib/current-portal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  aal: "aal1" | "aal2";
}

/** The verified signed-in user for this request, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (!claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(claims.sub),
    email: String(claims.email ?? ""),
    fullName: String(meta.full_name ?? claims.email ?? ""),
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export const getContexts = cache(async (): Promise<MyContext[]> => {
  const db = await createSupabaseServerClient();
  return getMyContexts(db);
});

export const portalPath = portalPathFor;

export interface OrgContext {
  user: SessionUser;
  context: MyContext;
  contexts: MyContext[];
  capabilities: ReadonlySet<Capability>;
  /** The organisation's timezone: every member sees its dates and times in it. */
  timezone: string;
  /** Company logo in private storage (Settings → Company logo), if any. */
  logoPath: string | null;
}

/**
 * Resolve the organisation named in the URL for the signed-in user. The URL is
 * only a selector: membership and capabilities come from the database, so
 * editing the organisation id in the URL grants nothing (critical test 3).
 */
export const loadOrgContext = cache(async (organisationId: string, onlyKinds?: readonly OrganisationKind[]): Promise<OrgContext> => {
  const user = await requireUser();
  const [contexts, portal] = await Promise.all([getContexts(), getCurrentPortal()]);
  const context = contexts.find((c) => c.organisation_id === organisationId);
  // An organisation opens only in the portal that serves its kind (ADR-009).
  if (!context || !portalServesContext(portal, context)) notFound();
  // Some pages exist for only one kind (for example the fleet register for companies).
  if (onlyKinds && !onlyKinds.includes(context.kind)) notFound();
  if (context.mfa_required && user.aal !== "aal2") {
    redirect(`/account/security?required=1&next=${encodeURIComponent(portalPath(context))}`);
  }
  const db = await createSupabaseServerClient();
  const [caps, org] = await Promise.all([
    getMyCapabilities(db, organisationId),
    db.from("organisations").select("timezone, logo_path").eq("id", organisationId).maybeSingle(),
  ]);
  const timezone = org.data?.timezone ?? BUSINESS_TIMEZONE;
  return { user, context, contexts, capabilities: new Set(caps as Capability[]), timezone, logoPath: org.data?.logo_path ?? null };
});

export async function requireCapability(ctx: OrgContext, capability: Capability) {
  if (!ctx.capabilities.has(capability)) notFound();
}

export const getStaffContext = cache(async () => {
  const db = await createSupabaseServerClient();
  return getMyStaffContext(db);
});
