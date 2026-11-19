import type { Metadata } from "next";
import { listEngagements } from "@hvems/api-client";
import { PageHeader } from "@/components/shell/page";
import { EngagementList } from "@/features/marketplace/engagement-list";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Engagements" };

/** The provider's engagements (MKT-11..19). Provider Technicians see the ones assigned to their business. */
export default async function ProviderEngagementsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["provider"]);
  const db = await createSupabaseServerClient();
  const rows = await listEngagements(db, { providerId: orgId });
  return (
    <>
      <PageHeader title="Engagements" description="Jobs customers have accepted you for: site details, attendance, findings, completion and reviews." />
      <EngagementList rows={rows} base={`/provider/${orgId}`} tz={ctx.timezone} />
    </>
  );
}
