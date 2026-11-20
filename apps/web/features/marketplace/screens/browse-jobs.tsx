import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { browseMarketplaceJobs, listMarketplaceRegions } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK } from "@/components/ui/primitives";
import { JOB_STATUS, JOB_TYPES, PROPOSAL_STATUS, PROVIDER_CATEGORIES, budgetText, closesText, type JobType, type ProviderCategory } from "@/features/marketplace/labels";
import { MarketplaceTabs } from "@/features/marketplace/marketplace-tabs";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

const VIEWS = { all: "All open jobs", matching: "Matching my services", saved: "Saved", mine: "My proposals" } as const;

/** Provider job search (MKT-06/07): keyword, category, type, urgency, region; saved jobs; my proposals. */
export async function BrowseJobsScreen({
  orgId,
  sp,
  portal,
}: {
  orgId: string;
  sp: Record<string, string | string[] | undefined>;
  /** Provider portal, or the company portal working as a provider (decision O-13). */
  portal: "provider" | "company";
}) {
  const ctx = await loadOrgContext(orgId, portal === "provider" ? ["provider"] : ["company"]);
  if (!can(ctx.capabilities, "provider.jobs.browse")) notFound();
  const view = (firstParam(sp.view) ?? "all") as keyof typeof VIEWS;
  const tab = VIEWS[view] ? view : "all";
  const f = {
    q: (firstParam(sp.q) ?? "").trim().slice(0, 60),
    category: firstParam(sp.category) ?? "",
    type: firstParam(sp.type) ?? "",
    urgency: firstParam(sp.urgency) ?? "",
    region: firstParam(sp.region) ?? "",
  };
  const db = await createSupabaseServerClient();
  const [jobs, regions] = await Promise.all([
    browseMarketplaceJobs(db, orgId, { q: f.q, category: f.category, jobType: f.type, urgency: f.urgency, region: f.region, saved: tab === "saved", mine: tab === "mine" }),
    listMarketplaceRegions(db),
  ]);
  const shown = tab === "matching" ? jobs.filter((j) => j.matches) : jobs;
  const base = portal === "provider" ? `/provider/${orgId}/jobs` : `/customer/${orgId}/jobs`;

  return (
    <>
      <PageHeader
        title={portal === "company" ? (tab === "mine" ? "Our proposals" : "Find work") : tab === "mine" ? "My proposals" : "Browse jobs"}
        description={portal === "company" ? "Other organisations' jobs your company can quote on as a provider. Urgent jobs are listed first." : "Open jobs in the marketplace regions. Urgent jobs are listed first."}
      />
      {portal === "company" ? (
        <MarketplaceTabs
          orgId={orgId}
          active={tab === "mine" ? "proposals" : "find"}
          canPost={can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept")}
          canProvide
        />
      ) : null}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Job views">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
          <Link
            key={k}
            href={k === "all" ? base : `${base}?view=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap", tab === k ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {VIEWS[k]}
          </Link>
        ))}
      </nav>
      <Card>
        <FilterBar
          action={base}
          keep={tab === "all" ? {} : { view: tab }}
          search={{ value: f.q, placeholder: "Keyword or suburb" }}
          fields={[
            { kind: "select", name: "category", label: "Service", all: "Any service", value: f.category, options: (Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => ({ value: k, label: PROVIDER_CATEGORIES[k] })) },
            { kind: "select", name: "type", label: "Job type", all: "Any type", value: f.type, options: (Object.keys(JOB_TYPES) as JobType[]).map((k) => ({ value: k, label: JOB_TYPES[k] })) },
            { kind: "select", name: "urgency", label: "Urgency", all: "Any", value: f.urgency, options: [{ value: "urgent", label: "Urgent" }, { value: "standard", label: "Standard" }] },
            { kind: "select", name: "region", label: "Region", all: "All regions", value: f.region, options: regions.filter((r) => r.open).map((r) => ({ value: r.code, label: r.name })) },
          ]}
        />
        {shown.length === 0 ? (
          <EmptyState title={tab === "mine" ? "No proposals yet" : tab === "saved" ? "No saved jobs" : "No jobs match"}>
            {tab === "all" ? "New jobs in your services and regions also arrive in your alerts." : null}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-stroke">
            {shown.map((j) => {
              const st = j.status === "open" ? null : JOB_STATUS[j.status];
              return (
                <li key={j.id} className="relative px-5 py-4 hover:bg-surface-hover">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`${base}/${j.id}`} className={cn("text-[15px] font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                        {j.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {j.suburb}
                          {j.region ? `, ${j.region}` : ""}
                        </span>
                        <span>· {PROVIDER_CATEGORIES[j.category]}</span>
                        <span>· {JOB_TYPES[j.job_type]}</span>
                        {budgetText(j) ? <span>· {budgetText(j)}</span> : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {j.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : null}
                      {j.invited ? <Badge tone="blue">Invited</Badge> : null}
                      {j.matches ? <Badge tone="green">Matches your services</Badge> : null}
                      {j.my_proposal ? <Badge tone={PROPOSAL_STATUS[j.my_proposal as keyof typeof PROPOSAL_STATUS]?.tone ?? "grey"}>Proposal: {PROPOSAL_STATUS[j.my_proposal as keyof typeof PROPOSAL_STATUS]?.label}</Badge> : null}
                      {st ? <Badge tone={st.tone}>{st.label}</Badge> : <span className="text-[12.5px] text-ink-subtle">{closesText(j.closes_at, ctx.timezone)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
