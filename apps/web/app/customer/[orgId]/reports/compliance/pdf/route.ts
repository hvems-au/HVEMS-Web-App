import { notFound } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganisation, logReportExport } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { buildCompliance, compliancePeriod, complianceSections } from "@/features/reports/compliance";
import { orgLogoForPdf } from "@/lib/org-logo";
import { CompliancePdf } from "@/lib/pdf/compliance-document";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Compliance summary PDF (RPT-03/04); the export is audited. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "reports.export")) notFound();
  const { from, to } = compliancePeriod(Object.fromEntries(new URL(request.url).searchParams), ctx.timezone);
  const db = await createSupabaseServerClient();
  const [c, org] = await Promise.all([buildCompliance(db, orgId, ctx.timezone, from, to), getOrganisation(db, orgId)]);
  const who = ctx.user.fullName || ctx.user.email || "a member";
  const pdf = await renderToBuffer(
    CompliancePdf({
      company: org.name,
      companyLogo: await orgLogoForPdf(db, org.logo_path),
      summary: c,
      sections: complianceSections(c),
      generated: `Generated ${formatDateTimeAU(new Date(), ctx.timezone)} by ${who}`,
    }),
  );
  await logReportExport(db, orgId, "compliance-summary", c.deferrals.length + c.returns.length, { from, to, format: "pdf" });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hvems-compliance-${from}-to-${to}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
