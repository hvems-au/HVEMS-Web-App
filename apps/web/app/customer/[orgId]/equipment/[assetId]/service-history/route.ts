import { renderToBuffer } from "@react-pdf/renderer";
import {
  formatWorkOrderNumber,
  getAsset,
  getOrganisation,
  getPersonNames,
  listDefects,
  listDocuments,
  listServiceSchedule,
  listWorkOrders,
} from "@hvems/api-client";
import { CONDITION_LABELS, DEFECT_SEVERITY_LABELS, DEFECT_STATUS_LABELS, formatDateTimeAU } from "@hvems/domain";
import { DOCUMENT_CATEGORIES } from "@/features/documents/categories";
import { orgLogoForPdf } from "@/lib/org-logo";
import { ServiceHistoryPdf } from "@/lib/pdf/service-history-document";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUS: Record<string, string> = { ok: "OK", due_soon: "Due soon", overdue: "Overdue" };
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const n1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v).toLocaleString("en-AU", { maximumFractionDigits: 1 }));

/** Service history pack PDF for one piece of equipment (RPT-04). Shows what the person may see. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const a = await getAsset(db, assetId).catch(() => null);
  if (!a || a.organisation_id !== orgId) return new Response("Not found", { status: 404 });
  const [org, plans, wos, defects, docs] = await Promise.all([
    getOrganisation(db, orgId),
    listServiceSchedule(db, orgId, assetId).catch(() => []),
    listWorkOrders(db, orgId, { assetId, open: false, limit: 500 }).catch(() => []),
    listDefects(db, { organisationId: orgId, assetId, limit: 500 }).catch(() => []),
    listDocuments(db, { organisationId: orgId, assetId }).catch(() => []),
  ]);
  const closed = wos.filter((w) => w.status === "closed");
  const names = await getPersonNames(db, closed.map((w) => w.completed_by));
  const tz = ctx.timezone;
  const interval = (p: (typeof plans)[number]) =>
    [p.interval_days ? `${p.interval_days} days` : null, p.interval_km ? `${n1(p.interval_km)} km` : null, p.interval_hours ? `${n1(p.interval_hours)} hours` : null].filter(Boolean).join(" / ");
  const nextDue = (p: (typeof plans)[number]) =>
    [p.next_due_on ? dmy(p.next_due_on) : null, p.next_due_km ? `${n1(p.next_due_km)} km` : null, p.next_due_hours ? `${n1(p.next_due_hours)} hours` : null].filter(Boolean).join(" / ") || "—";

  const pdf = await renderToBuffer(
    ServiceHistoryPdf({
      company: org.name,
      companyLogo: await orgLogoForPdf(db, org.logo_path),
      generated: `Generated ${formatDateTimeAU(new Date(), tz)} by ${ctx.user.fullName || ctx.user.email}`,
      assetNumber: a.asset_number,
      heading: [a.make, a.model].filter(Boolean).join(" ") || a.asset_number,
      condition: a.archived_at ? "Archived" : CONDITION_LABELS[a.condition],
      fields: [
        ["Class", a.asset_class?.name ?? "—"],
        ["Year", a.year ? String(a.year) : "—"],
        ["Registration", a.registration_number ? `${a.registration_number} ${a.registration_state ?? ""}`.trim() : "—"],
        ["VIN / Serial", a.vin ?? a.serial_number ?? "—"],
        ["Site", a.site?.name ?? "—"],
        ["Client", a.client?.name ?? "—"],
        ["Odometer", a.current_odometer_km !== null ? `${n1(a.current_odometer_km)} km` : "—"],
        ["Hour meter", a.current_engine_hours !== null ? `${n1(a.current_engine_hours)} hours` : "—"],
      ],
      plans: plans.map((p) => [p.name, interval(p), dmy(p.last_done_on), nextDue(p), STATUS[p.status] ?? p.status]),
      services: closed.map((w) => [
        dmy(w.closed_at),
        formatWorkOrderNumber(w.number),
        [w.title, w.completion_notes].filter(Boolean).join(": "),
        w.kind === "vendor" ? (w.vendor_name ?? "Vendor") : w.completed_by ? (names.get(w.completed_by) ?? "Former member") : "—",
        [w.odometer_km !== null ? `${n1(w.odometer_km)} km` : null, w.engine_hours !== null ? `${n1(w.engine_hours)} h` : null].filter(Boolean).join(" · ") || "—",
      ]),
      defects: defects.map((d) => [
        dmy(d.reported_at),
        d.title,
        DEFECT_SEVERITY_LABELS[d.severity],
        DEFECT_STATUS_LABELS[d.status as keyof typeof DEFECT_STATUS_LABELS] ?? d.status,
        dmy((d as { closed_at?: string | null }).closed_at),
      ]),
      documents: docs.map((d) => [d.title, DOCUMENT_CATEGORIES[d.category], dmy(d.expires_on)]),
    }),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="service-history-${a.asset_number.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
