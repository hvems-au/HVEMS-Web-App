import type { Metadata } from "next";
import Link from "next/link";
import { listInspections } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { ResultBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inspections" };

/** Submitted pre-starts. Managers see the whole company; drivers see their own (RLS). */
export default async function InspectionsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const rows = await listInspections(db, { organisationId: orgId, limit: 100 });

  return (
    <>
      <PageHeader title="Inspections" description="Pre-starts submitted for your equipment, newest first. Start a pre-start from the equipment page." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No pre-starts yet">Open a piece of equipment and choose Pre-start.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Submitted</TH>
                <TH>Equipment</TH>
                <TH>Operator</TH>
                <TH>Result</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/customer/${orgId}/inspections/${r.id}`} className="font-semibold text-link hover:underline">
                      {formatDateTimeAU(new Date(r.submitted_at), ctx.timezone)}
                    </Link>
                  </TD>
                  <TD>
                    <span className="font-semibold">{r.header.asset_number}</span>
                    <span className="block text-[12.5px] text-ink-subtle">{[r.header.make, r.header.model].filter(Boolean).join(" ")}</span>
                  </TD>
                  <TD>{r.header.operator_name ?? "—"}</TD>
                  <TD>
                    <ResultBadge result={r.result} />
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
