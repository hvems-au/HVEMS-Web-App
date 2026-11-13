import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonNames, listPendingReadings } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DecideReading } from "./decide";

export const metadata: Metadata = { title: "Readings to approve" };

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-AU"));

/** Odometer / hour meter readings lower than the last (or dated earlier) waiting for a manager. */
export default async function ReadingsToApprove({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "meter_readings.accept")) notFound();
  const db = await createSupabaseServerClient();
  const rows = await listPendingReadings(db, orgId);
  const names = await getPersonNames(db, [...new Set(rows.map((r) => r.recorded_by).filter(Boolean) as string[])]);

  return (
    <>
      <PageHeader
        title="Readings to approve"
        description="Odometer and hour meter readings lower than the last accepted one, or dated before it. Approve to make it current, or reject it."
        breadcrumb={{ label: "Equipment", href: `/customer/${orgId}/equipment` }}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing to approve">Readings that need a manager appear here, and in the bell.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Equipment</TH>
                <TH>Reading</TH>
                <TH>Current</TH>
                <TH>Reason</TH>
                <TH>Recorded</TH>
                <TH className="text-right">Decision</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const unit = r.unit === "km" ? "km" : "h";
                const current = r.unit === "km" ? r.asset?.current_odometer_km : r.asset?.current_engine_hours;
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/customer/${orgId}/equipment/${r.asset_id}`} className="relative z-10 font-semibold text-link hover:underline">
                        {r.asset?.asset_number ?? "Equipment"}
                      </Link>
                      <span className="block text-[12.5px] text-ink-muted">{[r.asset?.make, r.asset?.model].filter(Boolean).join(" ")}</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="font-semibold">
                        {fmt(r.value)} {unit}
                      </span>
                      <span className="block text-[12px] text-ink-subtle">{r.unit === "km" ? "Odometer" : "Hour meter"}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">
                      {fmt(current)} {unit}
                    </TD>
                    <TD className="max-w-[280px]">
                      {r.out_of_sequence ? <Badge tone="amber">Dated before the last reading</Badge> : (r.lower_reading_reason ?? "—")}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">
                      {formatDateTimeAU(new Date(r.read_at), ctx.timezone)}
                      <span className="block text-[12px] text-ink-subtle">{r.recorded_by ? (names.get(r.recorded_by) ?? "Former member") : "—"}</span>
                    </TD>
                    <TD>
                      <DecideReading orgId={orgId} readingId={r.id} label={`${r.asset?.asset_number ?? "reading"} ${fmt(r.value)} ${unit}`} />
                    </TD>
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
