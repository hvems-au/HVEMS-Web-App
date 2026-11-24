import "server-only";
import { notFound } from "next/navigation";
import { getOrganisation, logReportExport } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { buildFullExport } from "@/features/reports/full-export";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Full export of an organisation's records as a zip (SoW 3.8); audited. Owner, Account Owner or Provider Owner (data.full_export). */
export async function fullExportResponse(orgId: string): Promise<Response> {
  const ctx = await loadOrgContext(orgId);
  if (!can(ctx.capabilities, "data.full_export")) notFound();
  const db = await createSupabaseServerClient();
  const org = await getOrganisation(db, orgId);
  const { zip, rows } = await buildFullExport(db, orgId, {
    company: org.name,
    generated: `Generated ${formatDateTimeAU(new Date(), ctx.timezone)} by ${ctx.user.fullName || ctx.user.email}`,
    includeAudit: can(ctx.capabilities, "audit.view"),
  });
  await logReportExport(db, orgId, "full-export", rows, {});
  const safe = org.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "company";
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hvems-${safe}-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
