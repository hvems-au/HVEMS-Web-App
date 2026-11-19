import { notFound } from "next/navigation";
import { getOrganisation, logReportExport } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { buildFullExport } from "@/features/reports/full-export";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Full export of the company's records as a zip of CSVs (SoW 3.8); audited. Owner and Company Admin only. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
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
