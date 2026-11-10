import type { Metadata } from "next";
import Link from "next/link";
import { listDefects } from "@hvems/api-client";
import { DEFECT_SEVERITY_EFFECT, DEFECT_STATUS_LABELS, formatDateAU, formatDateTimeAU, todayISO } from "@hvems/domain";
import { SeverityBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Defects & Safety" };

const RANK = { critical: 0, minor: 1, advisory: 2 } as const;

/** Open defects (most serious first) and closed ones (newest first). */
export default async function DefectsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ orgId }, { view }] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const closed = view === "closed";
  const all = await listDefects(db, { organisationId: orgId, limit: 300 });
  const open = all.filter((d) => d.status === "open").sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.reported_at.localeCompare(a.reported_at));
  const done = all.filter((d) => d.status !== "open");
  const rows = closed ? done : open;
  const today = todayISO(ctx.timezone);
  const base = `/customer/${orgId}/defects`;

  return (
    <>
      <PageHeader title="Defects & Safety" description="Triage defects, mark repairs and return equipment to service" />
      <div className="mb-4 flex gap-1 rounded-[8px] bg-surface-muted p-1 text-[14px] font-semibold sm:w-fit">
        {[
          { label: `Open (${open.length})`, href: base, on: !closed },
          { label: `Closed (${done.length})`, href: `${base}?view=closed`, on: closed },
        ].map((t) => (
          <Link key={t.href} href={t.href} className={cn("rounded-[6px] px-4 py-1.5", t.on ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={closed ? "No closed defects yet" : "No open defects"}>Faults reported at pre-start appear here.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Severity</TH>
                <TH>Defect</TH>
                <TH>Equipment</TH>
                <TH>{closed ? "Outcome" : "Status"}</TH>
                <TH>Reported</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => {
                const due = d.deferred_until ?? d.due_date;
                return (
                  <TR key={d.id}>
                    <TD>
                      <span title={DEFECT_SEVERITY_EFFECT[d.severity]}>
                        <SeverityBadge severity={d.severity} />
                      </span>
                    </TD>
                    <TD>
                      <Link href={`${base}/${d.id}`} className="font-semibold text-link hover:underline">
                        {d.title}
                      </Link>
                      {d.description ? <span className="block text-[13px] text-ink-muted">“{d.description}”</span> : null}
                    </TD>
                    <TD>
                      <Link href={`/customer/${orgId}/equipment/${d.asset_id}`} className="hover:underline">
                        {d.asset?.asset_number ?? "Equipment"}
                      </Link>
                    </TD>
                    <TD>
                      {closed ? (
                        <Badge tone={d.status === "repaired" ? "green" : "grey"}>{DEFECT_STATUS_LABELS[d.status]}</Badge>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {!d.triaged_at ? <Badge tone="blue">New</Badge> : <Badge tone="grey">Triaged</Badge>}
                          {due ? (
                            <Badge tone={due < today ? "red" : "grey"}>
                              {due < today ? "Overdue" : "Due"} {formatDateAU(new Date(`${due}T00:00:00Z`), "UTC")}
                            </Badge>
                          ) : null}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}</TD>
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
