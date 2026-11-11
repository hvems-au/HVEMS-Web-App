import { notFound } from "next/navigation";
import { loadPlatformAudit, parseOrgFilter } from "@/features/audit/platform-audit";
import { auditCsv, parseAuditQuery, securityCsv } from "@/features/audit/query";
import { getStaffContext, requireUser } from "@/lib/session";

/** Console CSV export with the page's filters (AUD-02). HVEMS staff with MFA only. */
export async function GET(request: Request) {
  const user = await requireUser("/admin/audit");
  const staff = await getStaffContext();
  if (!staff || user.aal !== "aal2") notFound();
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = parseAuditQuery(sp);
  const q = staff.role === "platform_administrator" ? parsed : { ...parsed, tab: "changes" as const };
  const { events, security, nameOf, orgOf } = await loadPlatformAudit(q, parseOrgFilter(sp.org), 5000);
  const tz = "Australia/Brisbane";
  const csv = q.tab === "security" ? securityCsv(security, nameOf, tz, orgOf) : auditCsv(events, nameOf, tz, orgOf);
  const name = `hvems-platform-${q.tab === "security" ? "security" : "audit"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
