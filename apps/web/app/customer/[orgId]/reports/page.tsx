import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ChevronRight, ClipboardCheck } from "lucide-react";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card } from "@/components/ui/primitives";
import { REPORTS, type ReportDef } from "@/features/reports/catalogue";
import { loadOrgContext } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const GROUPS: ReportDef["group"][] = ["Fleet", "Safety", "Maintenance", "Costs", "Marketplace and billing"];

/** The fifteen standard reports and the compliance summary (CS-24). */
export default async function ReportsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "reports.view")) notFound();
  const seesCosts = can(ctx.capabilities, "assets.costs.view");
  const base = `/customer/${orgId}/reports`;
  const fullExport = can(ctx.capabilities, "data.full_export");

  return (
    <>
      <PageHeader title="Reports" description="Standard reports with filters and CSV export. Each shows what its rows and figures mean." />
      <Link
        href={`${base}/compliance`}
        className="mb-5 flex items-center gap-4 rounded-[12px] border border-brand/30 bg-brand-soft px-5 py-4 transition-colors hover:border-brand"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface text-brand-ink" aria-hidden>
          <ClipboardCheck className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Compliance summary</span>
          <span className="block text-[13px] text-ink-muted">
            For any period: inspections, services, defects, notices and return-to-service decisions. Print to PDF or download CSV.
          </span>
        </span>
        <ChevronRight className="size-5 text-ink-muted" aria-hidden />
      </Link>
      <div className="flex flex-col gap-5">
        {fullExport ? (
          <Card className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-ink-muted" aria-hidden>
              <Archive className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">Full export</span>
              <span className="block text-[13px] text-ink-muted">
                Every record your company holds, one CSV per type, with the stored documents, photos and invoices (up to 150 MB). Recorded in the audit history.
              </span>
            </span>
            <a href={`${base}/full-export`} className="rounded-[8px] border border-stroke-strong px-3.5 py-2 text-[13.5px] font-medium text-ink hover:bg-surface-hover">
              Download zip
            </a>
          </Card>
        ) : null}
        {GROUPS.map((g) => (
          <Card key={g}>
            <h2 className="border-b border-stroke px-5 py-3 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">{g}</h2>
            <ul className="divide-y divide-stroke">
              {REPORTS.filter((r) => r.group === g).map((r) => {
                const locked = !!r.unavailable || (r.costs && !seesCosts);
                return (
                  <li key={r.key}>
                    <Link
                      href={`${base}/${r.key}`}
                      className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover", locked && "opacity-70")}
                    >
                      <span className="w-6 shrink-0 text-right font-mono text-[13px] text-ink-subtle">{r.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-medium text-ink">{r.title}</span>
                        <span className="block text-[13px] text-ink-muted">{r.summary}</span>
                      </span>
                      {r.unavailable ? <Badge tone="grey">2D</Badge> : r.costs && !seesCosts ? <Badge tone="grey">Cost access</Badge> : null}
                      <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
