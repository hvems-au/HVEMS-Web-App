import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { browseMarketplaceJobs, listMyProposals } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { MarketplaceTabs } from "@/features/marketplace/marketplace-tabs";
import { PROPOSAL_STATUS, availabilityText, priceText, proposalStatusNow } from "@/features/marketplace/labels";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

/** The organisation's own proposals (provider side), in either portal. */
export async function ProposalsScreen({
  orgId,
  sp,
  portal,
}: {
  orgId: string;
  sp: Record<string, string | string[] | undefined>;
  portal: "provider" | "company";
}) {
  const ctx = await loadOrgContext(orgId, portal === "provider" ? ["provider"] : ["company"]);
  if (!can(ctx.capabilities, "provider.jobs.browse") && !can(ctx.capabilities, "provider.proposals.manage")) notFound();
  const db = await createSupabaseServerClient();
  const [proposals, jobs] = await Promise.all([listMyProposals(db, orgId), browseMarketplaceJobs(db, orgId, { mine: true }).catch(() => [])]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const statusOf = (p: (typeof proposals)[number]) => proposalStatusNow(p);
  const f = { q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60), status: firstParam(sp.status) ?? "" };
  const rows = proposals.filter((p) => {
    const j = jobOf.get(p.job_id);
    return (!f.q || [j?.title, j?.suburb, j ? `job ${j.number}` : ""].some((x) => (x ?? "").toLowerCase().includes(f.q))) && (!f.status || statusOf(p) === f.status);
  });
  const base = portal === "provider" ? `/provider/${orgId}` : `/customer/${orgId}`;
  const counts = { active: proposals.filter((p) => statusOf(p) === "active").length, accepted: proposals.filter((p) => p.status === "accepted").length };

  return (
    <>
      <PageHeader
        title={portal === "company" ? "Our proposals" : "My proposals"}
        description={`Quotes you've submitted: ${counts.active} active, ${counts.accepted} accepted. Revise or withdraw an active proposal from its job.`}
      />
      {portal === "company" ? (
        <MarketplaceTabs
          orgId={orgId}
          active="proposals"
          canPost={can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept")}
          canProvide
        />
      ) : null}
      <Card>
        <FilterBar
          action={`${base}/proposals`}
          search={{ value: f.q, placeholder: "Job, suburb or job number" }}
          fields={[
            { kind: "select", name: "status", label: "Status", all: "Any status", value: f.status, options: Object.entries(PROPOSAL_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={proposals.length ? "No proposals match" : "No proposals yet"}>
            {proposals.length ? (
              "Try a different search or filter."
            ) : (
              <>
                Find a job under{" "}
                <Link href={`${base}/jobs`} className="text-link hover:underline">
                  {portal === "company" ? "Find work" : "Browse jobs"}
                </Link>{" "}
                and submit a proposal.
              </>
            )}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Job</TH>
                <TH>Price</TH>
                <TH>Availability</TH>
                <TH>Status</TH>
                <TH>Valid until</TH>
                <TH>Last change</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((p) => {
                const j = jobOf.get(p.job_id);
                const st = PROPOSAL_STATUS[statusOf(p)];
                return (
                  <TR key={p.id}>
                    <TD className="max-w-[300px]">
                      <Link href={`${base}/jobs/${p.job_id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                        {j?.title ?? "Job"}
                      </Link>
                      <span className="block text-[12.5px] text-ink-muted">
                        {j ? `Job ${j.number} · ${j.suburb}` : ""}
                        {j?.urgency === "urgent" ? " · Urgent" : ""}
                        {p.version > 1 ? ` · revised ${p.version - 1}×` : ""}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap">{p.current ? priceText(p.current) : "—"}</TD>
                    <TD className="whitespace-nowrap">{p.current ? availabilityText(p.current) : "—"}</TD>
                    <TD>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(p.valid_until), ctx.timezone)}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(p.updated_at), ctx.timezone)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
