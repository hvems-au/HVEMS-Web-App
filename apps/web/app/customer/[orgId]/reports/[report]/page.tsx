import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Construction, Download, Info } from "lucide-react";
import { listClients, listSites } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { BackLink } from "@/components/back-link";
import { FilterBar, type FilterField } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { buildReport, parseReportFilters } from "@/features/reports/build";
import { reportByKey } from "@/features/reports/catalogue";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SHOWN = 300;

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }): Promise<Metadata> {
  const def = reportByKey((await params).report);
  return { title: def ? def.title : "Report" };
}

/** One standard report: filters, headline figures, the rows, and the same rows as CSV (RPT-02). */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, report }, sp] = await Promise.all([params, searchParams]);
  const def = reportByKey(report);
  if (!def) notFound();
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "reports.view")) notFound();
  const seesCosts = can(ctx.capabilities, "assets.costs.view");
  const canExport = can(ctx.capabilities, "reports.export");
  const base = `/customer/${orgId}/reports`;
  const header = (
    <>
      <BackLink href={base} label="Reports" />
      <PageHeader title={`${def.number}. ${def.title}`} description={def.summary} />
    </>
  );

  if (def.unavailable || (def.costs && !seesCosts)) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={<Construction />} title={def.unavailable ? "Not available yet" : "Cost access needed"}>
            {def.unavailable ?? "This report shows costs. Ask your Company Admin for a role that can see costs."}
          </EmptyState>
        </Card>
      </>
    );
  }

  const f = parseReportFilters(sp);
  const db = await createSupabaseServerClient();
  const [built, sites, clients] = await Promise.all([
    buildReport(db, def.key, orgId, ctx.timezone, f, { seesCosts }),
    listSites(db, orgId).catch(() => []),
    listClients(db, orgId).catch(() => []),
  ]);
  const assetOptions = [...built.assets.entries()].map(([value, a]) => ({ value, label: [a.number, a.make, a.model].filter(Boolean).join(" · ") })).sort((a, b) => a.label.localeCompare(b.label));
  const classOptions = [...new Map([...built.assets.values()].filter((a) => a.cls).map((a) => [a.cls, a.clsName])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const fields: FilterField[] = [];
  if (def.filters.includes("status") && built.statuses.length)
    fields.push({ kind: "select", name: "status", label: def.key === "maintenance-cost" ? "Type" : "Status", all: "Any", value: f.status, options: built.statuses });
  if (def.filters.includes("asset")) fields.push({ kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: assetOptions });
  if (def.filters.includes("class")) fields.push({ kind: "select", name: "class", label: "Class", all: "Any class", value: f.class, options: classOptions });
  if (def.filters.includes("site")) fields.push({ kind: "select", name: "site", label: "Site", all: "All sites", value: f.site, options: sites.map((s) => ({ value: s.id, label: s.name })) });
  if (def.filters.includes("client"))
    fields.push({ kind: "select", name: "client", label: "Client", all: "All clients", value: f.client, options: clients.map((c) => ({ value: c.id, label: c.name })) });
  if (def.filters.includes("date")) {
    fields.push({ kind: "date", name: "from", label: `${def.dateLabel ?? "Date"} from`, value: f.from });
    fields.push({ kind: "date", name: "to", label: "to", value: f.to });
  }
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex flex-1 flex-wrap gap-3">
          {built.totals.map((t) => (
            <Card key={t.label} className="min-w-[140px] px-4 py-3">
              <p className="text-[12.5px] text-ink-muted">{t.label}</p>
              <p className="text-[22px] font-semibold text-ink">{t.value}</p>
            </Card>
          ))}
        </div>
        {canExport ? (
          <Button asChild>
            <Link href={`${base}/${def.key}/csv${query ? `?${query}` : ""}`} prefetch={false}>
              <Download /> Download CSV
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="mb-4 flex gap-2 rounded-[10px] border border-stroke bg-surface px-4 py-3 text-[13px] text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{def.definition}</span>
      </p>
      <Card>
        <FilterBar action={`${base}/${def.key}`} fields={fields} />
        {built.rows.length === 0 ? (
          <EmptyState title="Nothing to show">Try a wider date range or fewer filters.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  {built.columns.map((c) => (
                    <TH key={c} className="whitespace-nowrap">
                      {c}
                    </TH>
                  ))}
                </tr>
              </THead>
              <tbody>
                {built.rows.slice(0, SHOWN).map((r, i) => (
                  <TR key={i}>
                    {r.map((c, j) => (
                      <TD key={j} className="max-w-[280px] truncate whitespace-nowrap text-[13px]" title={typeof c === "string" && c.length > 40 ? c : undefined}>
                        {c === null || c === "" ? <span className="text-ink-subtle">—</span> : typeof c === "number" ? c.toLocaleString("en-AU") : c}
                      </TD>
                    ))}
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {built.rows.length > SHOWN ? (
          <p className="border-t border-stroke px-5 py-3 text-[12.5px] text-ink-muted">
            Showing the first {SHOWN} of {built.rows.length.toLocaleString("en-AU")} rows. The CSV has them all.
          </p>
        ) : null}
        {built.truncated ? (
          <p className="border-t border-stroke px-5 py-3 text-[12.5px] text-warn-ink">More than 10,000 records: narrow the dates to see everything.</p>
        ) : null}
      </Card>
    </>
  );
}
