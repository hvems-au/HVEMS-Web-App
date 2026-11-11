import "server-only";
import { notFound } from "next/navigation";
import { can, type OrganisationKind } from "@hvems/permissions";
import { loadOrgContext } from "@/lib/session";
import { loadOrgAudit } from "./org-audit";
import { auditCsv, parseAuditQuery, securityCsv } from "./query";

/** CSV export of one organisation's audit or security events, with the page's filters (AUD-02). */
export async function orgAuditCsvResponse(request: Request, orgId: string, kinds: readonly OrganisationKind[]): Promise<Response> {
  const ctx = await loadOrgContext(orgId, kinds);
  if (!can(ctx.capabilities, "audit.view")) notFound();
  const q = parseAuditQuery(Object.fromEntries(new URL(request.url).searchParams));
  const { events, security, nameOf } = await loadOrgAudit(orgId, ctx.timezone, q, 5000);
  const csv = q.tab === "security" ? securityCsv(security, nameOf, ctx.timezone) : auditCsv(events, nameOf, ctx.timezone);
  const name = `hvems-${q.tab === "security" ? "security" : "audit"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
