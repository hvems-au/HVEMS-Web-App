import { renderToBuffer } from "@react-pdf/renderer";
import {
  formatWorkOrderNumber,
  getOrganisation,
  getPersonNames,
  getWorkOrder,
  listCostLines,
  listPartsUsage,
  listWorkOrderFiles,
  listWorkOrderReports,
} from "@hvems/api-client";
import { formatAud, formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { POST_CHECKS, PRE_CHECKS } from "@/features/technician/checks";
import { orgLogoForPdf } from "@/lib/org-logo";
import { WorkOrderPdf } from "@/lib/pdf/work-order-document";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", completed: "Completed", closed: "Closed", cancelled: "Cancelled" };
const KINDS: Record<string, string> = { parts: "Parts", labour: "Labour", external: "Outside work", fuel: "Fuel", other: "Other" };
const ANSWER: Record<string, string> = { ok: "OK", issue: "Issue", na: "N/A" };
const FILE_KIND: Record<string, string> = { invoice: "Invoice", receipt: "Receipt", quote: "Quote", photo: "Photo", other: "Other" };
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const n1 = (v: number | null) => (v === null ? null : Number(v).toLocaleString("en-AU", { maximumFractionDigits: 1 }));

/** Work order PDF (RPT-04). What it shows follows the person's access; costs only for cost readers. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; woId: string }> }) {
  const { orgId, woId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const w = await getWorkOrder(db, orgId, woId).catch(() => null);
  if (!w) return new Response("Not found", { status: 404 });
  const seesCosts = can(ctx.capabilities, "assets.costs.view");
  const [org, reports, files, usage, costs] = await Promise.all([
    getOrganisation(db, orgId),
    listWorkOrderReports(db, w.id).catch(() => []),
    listWorkOrderFiles(db, w.id).catch(() => []),
    listPartsUsage(db, w.id).catch(() => []),
    seesCosts ? listCostLines(db, { workOrderId: w.id }).catch(() => []) : Promise.resolve([]),
  ]);
  const names = await getPersonNames(db, [w.assigned_to, w.completed_by, w.closed_by, ...reports.map((r) => r.created_by)]);
  const nm = (id: string | null) => (id ? (names.get(id) ?? "Former member") : "—");
  const tz = ctx.timezone;
  const when = (iso: string | null) => (iso ? formatDateTimeAU(new Date(iso), tz) : "—");
  const number = formatWorkOrderNumber(w.number);

  const pdf = await renderToBuffer(
    WorkOrderPdf({
      company: org.name,
      companyLogo: await orgLogoForPdf(db, org.logo_path),
      generated: `Generated ${formatDateTimeAU(new Date(), tz)} by ${ctx.user.fullName || ctx.user.email}`,
      number,
      title: w.title,
      status: STATUS[w.status] ?? w.status,
      fields: [
        ["Equipment", [w.asset?.asset_number, w.asset?.make, w.asset?.model].filter(Boolean).join(" ")],
        ["Type", w.kind === "vendor" ? `Vendor: ${w.vendor_name ?? ""}` : "Internal"],
        ["Priority", w.priority.charAt(0).toUpperCase() + w.priority.slice(1)],
        ["Assigned to", w.kind === "vendor" ? (w.vendor_name ?? "") : nm(w.assigned_to)],
        ["Due", dmy(w.due_on) || "—"],
        ["Created", when(w.created_at)],
        ["Started", when(w.started_at)],
        ["Completed", w.completed_at ? `${when(w.completed_at)} by ${nm(w.completed_by)}` : "—"],
        ["Closed", w.closed_at ? `${when(w.closed_at)} by ${nm(w.closed_by)}` : "—"],
        ["Odometer at completion", w.odometer_km !== null ? `${n1(w.odometer_km)} km` : "—"],
        ["Hour meter at completion", w.engine_hours !== null ? `${n1(w.engine_hours)} hours` : "—"],
        ["Labour", w.labour_hours !== null ? `${n1(w.labour_hours)} hours` : "—"],
      ],
      description: w.description,
      completion: [w.completion_notes, w.close_note ? `Review note: ${w.close_note}` : null].filter(Boolean).join("\n\n") || null,
      reports: (["pre", "post"] as const).flatMap((k) => {
        const r = reports.find((x) => x.kind === k);
        if (!r) return [];
        const list = k === "pre" ? PRE_CHECKS : POST_CHECKS;
        return [
          {
            title: k === "pre" ? "Pre-work report" : "Post-work report",
            when: when(r.created_at),
            by: nm(r.created_by),
            checks: list.map((c) => [c.label, ANSWER[r.checks[c.id] ?? ""] ?? "—"] as [string, string]),
            notes: r.notes,
            readings: [r.odometer_km !== null ? `${n1(r.odometer_km)} km` : null, r.engine_hours !== null ? `${n1(r.engine_hours)} hours` : null].filter(Boolean).join(" · "),
          },
        ];
      }),
      parts: usage.map((u) => [u.description, `${Number(u.quantity)} ${u.unit}`, u.kind === "return" ? `Returned: ${u.reason ?? ""}` : "Fitted"] as [string, string, string]),
      files: files.map((f) => [f.file_name, FILE_KIND[f.kind] ?? f.kind, [f.supplier, f.reference].filter(Boolean).join(" · ")] as [string, string, string]),
      costs: seesCosts
        ? {
            lines: costs.map((c) => [KINDS[c.kind] ?? c.kind, c.description, formatAud(c.amount_cents)] as [string, string, string]),
            total: formatAud(costs.reduce((sum, c) => sum + c.amount_cents, 0)),
          }
        : null,
    }),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
