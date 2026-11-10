import type { Metadata } from "next";
import Link from "next/link";
import { listDefects } from "@hvems/api-client";
import { DEFECT_SEVERITY_EFFECT, formatDateTimeAU } from "@hvems/domain";
import { SeverityBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Card, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Defects & Safety" };

const RANK = { critical: 0, minor: 1, advisory: 2 } as const;

/**
 * Open defects raised by pre-starts. Triage, repair, clearance and return to
 * service arrive with the rest of 2B; until then defects stay open and keep
 * the equipment's condition (ADR-005: nothing clears a safety cause by itself).
 */
export default async function DefectsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const rows = (await listDefects(db, { organisationId: orgId, status: "open" })).sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || b.reported_at.localeCompare(a.reported_at),
  );

  return (
    <>
      <PageHeader title="Defects & Safety" description="Open defects across your fleet, most serious first" />
      <Card>
        <CardHeader
          title={`Open defects (${rows.length})`}
          description="Triage, repair and two-step clearance are being built next. Until then, defects stay open and keep the equipment's condition."
        />
        {rows.length === 0 ? (
          <EmptyState title="No open defects">Faults reported at pre-start appear here.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Severity</TH>
                <TH>Defect</TH>
                <TH>Equipment</TH>
                <TH>Reported</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <span title={DEFECT_SEVERITY_EFFECT[d.severity]}>
                      <SeverityBadge severity={d.severity} />
                    </span>
                  </TD>
                  <TD>
                    <span className="font-medium">{d.title}</span>
                    {d.description ? <span className="block text-[13px] text-ink-muted">“{d.description}”</span> : null}
                  </TD>
                  <TD>
                    <Link href={`/customer/${orgId}/equipment/${d.asset_id}`} className="font-semibold text-link hover:underline">
                      {d.asset?.asset_number ?? "Equipment"}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {d.inspection_id ? (
                      <Link href={`/customer/${orgId}/inspections/${d.inspection_id}`} className="hover:underline">
                        {formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}
                      </Link>
                    ) : (
                      formatDateTimeAU(new Date(d.reported_at), ctx.timezone)
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
