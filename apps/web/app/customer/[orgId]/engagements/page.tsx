import type { Metadata } from "next";
import { getEngagementDetails, listEngagements, marketplaceRpc } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { EngagementList } from "@/features/marketplace/engagement-list";
import { MarketplaceTabs } from "@/features/marketplace/marketplace-tabs";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Engagements" };

/**
 * Engagements where this organisation is the customer and, for a company working as a provider
 * (decision O-13), where it is the provider.
 */
export default async function CustomerEngagementsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const company = ctx.context.kind === "company";
  const db = await createSupabaseServerClient();
  const asCustomer = can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept");
  const asProvider = company && (can(ctx.capabilities, "provider.engagements.manage") || can(ctx.capabilities, "provider.engagements.work"));
  const [posted, provided] = await Promise.all([
    listEngagements(db, { posterId: orgId }),
    company ? listEngagements(db, { providerId: orgId }).catch(() => []) : Promise.resolve([]),
  ]);
  const rows = [...posted, ...provided].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at));

  // The other party's name (organisations aren't readable across tenants, so through the marketplace functions).
  const names = new Map<string, string>();
  for (const jobId of [...new Set(posted.map((r) => r.job_id))]) {
    const list = await marketplaceRpc<{ id: string; name: string }[]>(db, "marketplace_thread_providers", { p_job_id: jobId }).catch(() => []);
    for (const e of posted.filter((r) => r.job_id === jobId)) names.set(e.id, list.find((p) => p.id === e.provider_id)?.name ?? "Provider");
  }
  for (const e of provided) {
    const d = await getEngagementDetails(db, e.id).catch(() => null);
    names.set(e.id, d?.poster.name ?? "Customer");
    // Providers can't read the jobs table, so the job's public details come with the engagement.
    if (d) e.job = { title: d.job.title, number: d.job.number, urgency: d.job.urgency, suburb: d.job.suburb };
  }

  return (
    <>
      <PageHeader
        title="Engagements"
        description={company ? "Work you've engaged providers for, and work your company is doing for others." : "Providers you've engaged through the marketplace."}
      />
      {company ? <MarketplaceTabs orgId={orgId} active="engagements" canPost={asCustomer} canProvide={can(ctx.capabilities, "provider.jobs.browse")} /> : null}
      <EngagementList
        rows={rows}
        base={`/customer/${orgId}`}
        tz={ctx.timezone}
        otherName={names}
        roleOf={company ? (e) => (e.provider_id === orgId ? "Provider" : "Customer") : undefined}
        linkable={(e) => (e.provider_id === orgId ? asProvider : asCustomer)}
      />
    </>
  );
}
