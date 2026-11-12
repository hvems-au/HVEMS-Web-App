import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getMyCapabilities, getMyContexts } from "@hvems/api-client";
import { BUSINESS_TIMEZONE } from "@hvems/domain";
import type { MyContext } from "@hvems/types";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** A /driver path to come back to after signing in. Anything else is dropped (no open redirects). */
export function safeDriverPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/driver") || value.startsWith("//") || /[\\\s]/.test(value)) return undefined;
  return value;
}

/** Signed-out visitors go to sign-in, keeping where they were headed. */
export async function requireOperatorUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/driver?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Companies the person can work in as an operator (pre-starts or issue reports). */
export const getOperatorCompanies = cache(async (): Promise<MyContext[]> => {
  const db = await createSupabaseServerClient();
  const contexts = (await getMyContexts(db).catch(() => [])).filter((c) => c.kind === "company" && c.status !== "closed");
  const allowed = await Promise.all(
    contexts.map(async (c) => {
      const caps = await getMyCapabilities(db, c.organisation_id).catch(() => [] as string[]);
      return caps.includes("inspections.submit") || caps.includes("defects.report");
    }),
  );
  return contexts.filter((_, i) => allowed[i]);
});

export interface OperatorContext {
  user: SessionUser;
  company: MyContext;
  capabilities: ReadonlySet<string>;
  timezone: string;
}

/**
 * The operator workspace for one company. The company in the URL is only a
 * selector: membership and permissions come from the database (RLS checks every
 * read and write again). Not a member: 404, never another company's data.
 */
export const loadOperatorContext = cache(async (orgId: string, returnTo: string): Promise<OperatorContext> => {
  const user = await requireOperatorUser(returnTo);
  const db = await createSupabaseServerClient();
  const [companies, caps, org] = await Promise.all([
    getOperatorCompanies(),
    getMyCapabilities(db, orgId).catch(() => [] as string[]),
    db.from("organisations").select("timezone").eq("id", orgId).maybeSingle(),
  ]);
  const company = companies.find((c) => c.organisation_id === orgId);
  if (!company) notFound();
  return { user, company, capabilities: new Set(caps), timezone: org.data?.timezone ?? BUSINESS_TIMEZONE };
});
