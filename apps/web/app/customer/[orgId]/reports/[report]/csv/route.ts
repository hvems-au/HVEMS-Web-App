import { notFound } from "next/navigation";
import { logReportExport } from "@hvems/api-client";
import { toCsv } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { buildReport, parseReportFilters } from "@/features/reports/build";
import { reportByKey } from "@/features/reports/catalogue";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The report's rows as CSV, with the same filters as the screen; the export is audited (RPT-02/05, AUD-01). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string; report: string }> }) {
  const { orgId, report } = await params;
  const def = reportByKey(report);
  if (!def || def.unavailable) notFound();
  const ctx = await loadOrgContext(orgId, ["company"]);
  const seesCosts = can(ctx.capabilities, "assets.costs.view");
  if (!can(ctx.capabilities, "reports.export") || (def.costs && !seesCosts)) notFound();
  const f = parseReportFilters(Object.fromEntries(new URL(request.url).searchParams));
  const db = await createSupabaseServerClient();
  const built = await buildReport(db, def.key, orgId, ctx.timezone, f, { seesCosts });
  await logReportExport(
    db,
    orgId,
    def.key,
    built.rows.length,
    Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
  );
  const csv = toCsv([built.columns, ...built.rows]);
  const name = `hvems-${def.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
