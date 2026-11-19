import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { can } from "@hvems/permissions";
import { BackLink } from "@/components/back-link";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { buildCompliance, compliancePeriod, complianceSections } from "@/features/reports/compliance";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compliance summary" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Compliance summary for any period (RPT-03): screen, PDF and CSV. */
export default async function CompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "reports.view")) notFound();
  const canExport = can(ctx.capabilities, "reports.export");
  const { from, to } = compliancePeriod(sp, ctx.timezone);
  const db = await createSupabaseServerClient();
  const c = await buildCompliance(db, orgId, ctx.timezone, from, to);
  const base = `/customer/${orgId}/reports/compliance`;
  const q = `?from=${from}&to=${to}`;

  return (
    <>
      <BackLink href={`/customer/${orgId}/reports`} label="Reports" />
      <PageHeader
        title="Compliance summary"
        description={`${dmy(from)} to ${dmy(to)}. Inspections, services, defects, notices and return-to-service decisions.`}
        actions={
          canExport ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`${base}/csv${q}`} prefetch={false}>
                  <Download /> CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href={`${base}/pdf${q}`} prefetch={false}>
                  <FileText /> PDF
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <Card className="mb-5">
        <FilterBar
          action={base}
          fields={[
            { kind: "date", name: "from", label: "From", value: from },
            { kind: "date", name: "to", label: "To", value: to },
          ]}
        />
      </Card>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {complianceSections(c).map((s) => (
          <Card key={s.title}>
            <CardHeader title={s.title} description={s.definition} />
            <CardBody className="pt-0">
              <dl className="divide-y divide-stroke">
                {s.lines.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="font-semibold text-ink">{typeof value === "number" ? value.toLocaleString("en-AU") : value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="mb-5">
        <CardHeader title={`Deferred defects (${c.deferrals.length})`} description="Repairs deferred in the period, with who approved each." />
        {c.deferrals.length === 0 ? (
          <EmptyState title="No deferrals in this period" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Deferred</TH>
                <TH>Equipment</TH>
                <TH>Defect</TH>
                <TH>New repair date</TH>
                <TH>Reason</TH>
                <TH>Approved by</TH>
              </tr>
            </THead>
            <tbody>
              {c.deferrals.map((d, i) => (
                <TR key={i}>
                  <TD className="whitespace-nowrap">{d.when}</TD>
                  <TD>{d.asset}</TD>
                  <TD>{d.defect}</TD>
                  <TD className="whitespace-nowrap">{d.to}</TD>
                  <TD className="max-w-[260px]">{d.reason}</TD>
                  <TD>{d.approver}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title={`Return-to-service decisions (${c.returns.length})`} description="Each decision with its note and the number of evidence files." />
        {c.returns.length === 0 ? (
          <EmptyState title="No returns to service in this period" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Equipment</TH>
                <TH>Decided by</TH>
                <TH>Note</TH>
                <TH>Evidence</TH>
              </tr>
            </THead>
            <tbody>
              {c.returns.map((r, i) => (
                <TR key={i}>
                  <TD className="whitespace-nowrap">{r.when}</TD>
                  <TD>{r.asset}</TD>
                  <TD>{r.by}</TD>
                  <TD className="max-w-[340px]">{r.note}</TD>
                  <TD>{r.evidence}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
