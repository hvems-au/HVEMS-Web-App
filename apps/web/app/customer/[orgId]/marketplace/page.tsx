import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { formatWorkOrderNumber, listMarketplaceJobs } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { MarketplaceTabs } from "@/features/marketplace/marketplace-tabs";
import { JOB_STATUS, PROVIDER_CATEGORIES, closesText, effectiveJobStatus, type ProviderCategory } from "@/features/marketplace/labels";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Marketplace" };

/** The poster's marketplace jobs (company or marketplace-only customer). */
export default async function MarketplaceJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const canPost = can(ctx.capabilities, "marketplace.post");
  if (!canPost && !can(ctx.capabilities, "marketplace.accept") && !can(ctx.capabilities, "work_orders.manage")) notFound();
  const db = await createSupabaseServerClient();
  const jobs = await listMarketplaceJobs(db, orgId);
  const f = { q: (firstParam(sp.q) ?? "").trim().toLowerCase(), status: firstParam(sp.status) ?? "", category: firstParam(sp.category) ?? "" };
  const effective = (j: (typeof jobs)[number]) => effectiveJobStatus(j);
  const shown = jobs.filter(
    (j) =>
      (!f.q || [j.title, j.description, j.suburb, `job ${j.number}`].some((x) => x.toLowerCase().includes(f.q))) &&
      (!f.status || effective(j) === f.status) &&
      (!f.category || j.category === f.category),
  );
  const base = `/customer/${orgId}/marketplace`;

  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Jobs you've posted for verified providers to quote on. Proposals, questions and invitations are on each job."
        actions={
          canPost ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus /> Post a job
              </Link>
            </Button>
          ) : null
        }
      />
      {ctx.context.kind === "company" ? (
        <MarketplaceTabs orgId={orgId} active="posted" canPost={canPost || can(ctx.capabilities, "marketplace.accept")} canProvide={can(ctx.capabilities, "provider.jobs.browse")} />
      ) : null}
      {!canPost ? (
        <p className="mb-4 rounded-[10px] border border-stroke bg-surface px-4 py-3 text-[13.5px] text-ink-muted">
          You can see your company&apos;s marketplace jobs. To post jobs and accept proposals, ask your Owner for the <strong>Marketplace Buyer</strong> grant (Team → your name).
        </p>
      ) : null}
      <Card>
        <FilterBar
          action={base}
          search={{ value: f.q, placeholder: "Title, suburb or job number" }}
          fields={[
            { kind: "select", name: "status", label: "Status", all: "Any status", value: f.status, options: Object.entries(JOB_STATUS).map(([value, s]) => ({ value, label: s.label })) },
            {
              kind: "select",
              name: "category",
              label: "Service",
              all: "Any service",
              value: f.category,
              options: (Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => ({ value: k, label: PROVIDER_CATEGORIES[k] })),
            },
          ]}
        />
        {shown.length === 0 ? (
          <EmptyState title={jobs.length ? "No jobs match" : "No jobs posted yet"}>
            {jobs.length ? "Try a different search or filter." : canPost ? "Post a job, or use Post to marketplace on an open work order." : null}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Job</TH>
                <TH>Service</TH>
                <TH>Where</TH>
                <TH>Proposals</TH>
                <TH>Status</TH>
                <TH>Posted</TH>
              </tr>
            </THead>
            <tbody>
              {shown.map((j) => {
                const st = JOB_STATUS[effective(j)];
                return (
                  <TR key={j.id}>
                    <TD className="max-w-[300px]">
                      <Link href={`${base}/${j.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                        {j.title}
                      </Link>
                      <span className="block text-[12.5px] text-ink-muted">
                        Job {j.number}
                        {j.work_order ? ` · ${formatWorkOrderNumber(j.work_order.number)}` : ""}
                        {j.urgency === "urgent" ? " · Urgent" : ""}
                      </span>
                    </TD>
                    <TD>{PROVIDER_CATEGORIES[j.category]}</TD>
                    <TD>{j.suburb}</TD>
                    <TD>{j.proposals?.[0]?.count ?? 0}</TD>
                    <TD>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {effective(j) === "open" ? <span className="block text-[12px] text-ink-subtle">{closesText(j.closes_at, ctx.timezone)}</span> : null}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(j.posted_at), ctx.timezone)}</TD>
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
