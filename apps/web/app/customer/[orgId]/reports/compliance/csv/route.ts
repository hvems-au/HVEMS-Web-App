import { notFound } from "next/navigation";
import { logReportExport } from "@hvems/api-client";
import { toCsv } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { buildCompliance, compliancePeriod, complianceSections } from "@/features/reports/compliance";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Compliance summary as CSV: the figures, then the deferrals and return-to-service decisions (RPT-03). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "reports.export")) notFound();
  const { from, to } = compliancePeriod(Object.fromEntries(new URL(request.url).searchParams), ctx.timezone);
  const db = await createSupabaseServerClient();
  const c = await buildCompliance(db, orgId, ctx.timezone, from, to);
  const dmy = (iso: string) => iso.split("-").reverse().join("/");
  const rows: (string | number)[][] = [
    ["Compliance summary", `${dmy(from)} to ${dmy(to)}`, ""],
    ["Section", "Measure", "Value"],
    ...complianceSections(c).flatMap((s) => s.lines.map(([label, value]) => [s.title, label, value])),
    [],
    ["Deferred defects"],
    ["Deferred", "Equipment", "Defect", "New repair date", "Reason", "Approved by"],
    ...c.deferrals.map((d) => [d.when, d.asset, d.defect, d.to, d.reason, d.approver]),
    [],
    ["Return-to-service decisions"],
    ["When", "Equipment", "Decided by", "Note", "Evidence files"],
    ...c.returns.map((r) => [r.when, r.asset, r.by, r.note, r.evidence]),
  ];
  await logReportExport(db, orgId, "compliance-summary", c.deferrals.length + c.returns.length, { from, to, format: "csv" });
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hvems-compliance-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
