import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getMyCapabilities, getMyContexts, getMyStaffContext } from "@hvems/api-client";
import { PORTAL_FOR_KIND, type Capability, type OrganisationKind } from "@hvems/permissions";
import type { MyContext } from "@hvems/types";
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

export function portalPath(ctx: Pick<MyContext, "kind" | "organisation_id">): string {
  return `/${PORTAL_FOR_KIND[ctx.kind]}/${ctx.organisation_id}/dashboard`;
}

export interface OrgContext {
  user: SessionUser;
  context: MyContext;
  contexts: MyContext[];
  capabilities: ReadonlySet<Capability>;
}

/**
 * Resolve the organisation named in the URL for the signed-in user. The URL is
 * only a selector: membership and capabilities come from the database, so
 * editing the organisation id in the URL grants nothing (critical test 3).
 */
export const loadOrgContext = cache(async (organisationId: string, allowedKinds: readonly OrganisationKind[]): Promise<OrgContext> => {
  const user = await requireUser();
  const contexts = await getContexts();
  const context = contexts.find((c) => c.organisation_id === organisationId);
  if (!context || !allowedKinds.includes(context.kind)) notFound();
  if (context.mfa_required && user.aal !== "aal2") {
    redirect(`/account/security?required=1&next=${encodeURIComponent(portalPath(context))}`);
  }
  const db = await createSupabaseServerClient();
  const caps = await getMyCapabilities(db, organisationId);
  return { user, context, contexts, capabilities: new Set(caps as Capability[]) };
});

export async function requireCapability(ctx: OrgContext, capability: Capability) {
  if (!ctx.capabilities.has(capability)) notFound();
}

export const getStaffContext = cache(async () => {
  const db = await createSupabaseServerClient();
  return getMyStaffContext(db);
});
