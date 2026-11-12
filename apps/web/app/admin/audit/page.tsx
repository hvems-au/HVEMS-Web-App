import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { verifyAuditChain } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { AuditFilterBar } from "@/features/audit/filter-bar";
import { ENTITY_LABELS, methodTone, summarise } from "@/features/audit/format";
import { loadPlatformAudit, parseOrgFilter } from "@/features/audit/platform-audit";
import { ACTION_LABELS, contextText, parseAuditQuery, SECURITY_LABELS, securityDetail } from "@/features/audit/query";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit History" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Platform-wide audit history (SoW §2.3, §3.9, AUD-01–03): every organisation
 * plus platform-level events, sign-in and security events, filters, CSV
 * export, and the daily hash-chain check.
 */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const staff = await getStaffContext();
  // Sign-in and security events: the Super Admin only (database rule too).
  const superAdmin = staff?.role === "platform_administrator";
  const parsed = parseAuditQuery(sp);
  const q = superAdmin ? parsed : { ...parsed, tab: "changes" as const };
  const organisation = parseOrgFilter(sp.org);
  const db = await createSupabaseServerClient();
  const [{ events, security, nameOf, orgOf, organisations }, chain] = await Promise.all([
    loadPlatformAudit(q, organisation, 300),
    verifyAuditChain(db).catch(() => null),
  ]);
  const tz = "Australia/Brisbane";

  return (
    <>
      <PageHeader
        title="Audit History"
        description="Every creation, change, approval, sign-in and support access across all organisations and the platform. These records cannot be edited or deleted, and each day is sealed with a hash chain."
      />
      {chain ? (
        <Card className="mb-4 flex items-start gap-3 p-4">
          {chain.broken.length === 0 ? (
            <ShieldCheck className="mt-0.5 size-5 text-ok-ink" aria-hidden />
          ) : (
            <ShieldAlert className="mt-0.5 size-5 text-danger" aria-hidden />
          )}
          <div className="text-[13.5px]">
            {chain.broken.length === 0 ? (
              <p className="font-semibold text-ink">Audit records intact</p>
            ) : (
              <p className="font-semibold text-danger">Audit records changed on {chain.broken.map((b) => dmy(b.day)).join(", ")}</p>
            )}
            <p className="text-ink-muted">
              {chain.checked_days} {chain.checked_days === 1 ? "day" : "days"} checked against the daily hash chain
              {chain.last_sealed ? `; sealed up to ${dmy(chain.last_sealed)}` : ""}. Today&apos;s records are sealed just after midnight (Brisbane).
            </p>
          </div>
        </Card>
      ) : null}
      <AuditFilterBar basePath="/admin/audit" q={q} people={[]} organisations={organisations} organisation={organisation} showSecurity={superAdmin} />
      <Card>
        {q.tab === "changes" ? (
          events.length === 0 ? (
            <EmptyState title="No audit events match" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Organisation</TH>
                  <TH>Who</TH>
                  <TH>Identified by</TH>
                  <TH>Record</TH>
                  <TH>What happened</TH>
                  <TH>From</TH>
                </tr>
              </THead>
              <tbody>
                {events.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), tz)}</TD>
                    <TD>{e.organisation_id ? orgOf(e.organisation_id) : <span className="text-ink-subtle">Platform</span>}</TD>
                    <TD>{nameOf(e.actor_user_id)}</TD>
                    <TD>
                      <Badge tone={methodTone(e.actor_method)}>{e.actor_method.replace("_", " ")}</Badge>
                    </TD>
                    <TD>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</TD>
                    <TD className="max-w-[380px] truncate text-ink-muted" title={e.action === "update" ? JSON.stringify(e.changes) : undefined}>
                      <span className="mr-1 font-medium text-ink">{ACTION_LABELS[e.action] ?? e.action}</span>
                      {summarise(e.action, e.changes)}
                    </TD>
                    <TD className="whitespace-nowrap text-[12.5px] text-ink-subtle" title={e.context?.user_agent}>
                      {contextText(e.context) || "—"}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : security.length === 0 ? (
          <EmptyState title="No sign-in or security events match" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Organisation</TH>
                <TH>Who</TH>
                <TH>Event</TH>
                <TH>Details</TH>
                <TH>From</TH>
              </tr>
            </THead>
            <tbody>
              {security.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), tz)}</TD>
                  <TD>{e.organisation_id ? orgOf(e.organisation_id) : <span className="text-ink-subtle">Platform</span>}</TD>
                  <TD>{nameOf(e.user_id)}</TD>
                  <TD className="font-medium">{SECURITY_LABELS[e.event_type] ?? e.event_type}</TD>
                  <TD className="max-w-[380px] text-ink-muted">{securityDetail(e, nameOf) || "—"}</TD>
                  <TD className="whitespace-nowrap text-[12.5px] text-ink-subtle" title={e.context?.user_agent}>
                    {contextText(e.context) || "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
