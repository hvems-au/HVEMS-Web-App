import type { Metadata } from "next";
import { listEngagements, marketplaceRpc } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { EngagementList } from "@/features/marketplace/engagement-list";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Engagements" };

/** The poster's engagements with providers. */
export default async function CustomerEngagementsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const db = await createSupabaseServerClient();
  const rows = await listEngagements(db, { posterId: orgId });
  // Engagement pages are for people who post and accept (Owner, Marketplace Buyer); others see the list.
  const canWork = can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept");
  // Provider names per job (organisations aren't readable across tenants).
  const names = new Map<string, string>();
  for (const jobId of [...new Set(rows.map((r) => r.job_id))]) {
    const list = await marketplaceRpc<{ id: string; name: string }[]>(db, "marketplace_thread_providers", { p_job_id: jobId }).catch(() => []);
    for (const p of list) names.set(p.id, p.name);
  }
  return (
    <>
      <PageHeader title="Engagements" description={canWork ? "Providers you have engaged through the marketplace." : "Providers engaged through the marketplace. Opening an engagement needs the Marketplace Buyer grant."} />
      <EngagementList rows={rows} base={`/customer/${orgId}`} tz={ctx.timezone} otherName={names} linkable={canWork} />
    </>
  );
}
