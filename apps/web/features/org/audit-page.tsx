import { notFound } from "next/navigation";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { AuditFilterBar } from "@/features/audit/filter-bar";
import { ENTITY_LABELS, methodTone, summarise } from "@/features/audit/format";
import { loadOrgAudit } from "@/features/audit/org-audit";
import { ACTION_LABELS, contextText, parseAuditQuery, SECURITY_LABELS, securityDetail } from "@/features/audit/query";
import type { OrgContext } from "@/lib/session";

/**
 * SoW §3.9, AUD-01/02: Owners and Company Admins see their organisation's audit
 * history (changes) and sign-in and security events, with filters and CSV
 * export. Records are append-only and sealed daily (AUD-03).
 */
export async function AuditPage({ ctx, basePath, searchParams }: { ctx: OrgContext; basePath: string; searchParams: Record<string, string | string[] | undefined> }) {
  if (!can(ctx.capabilities, "audit.view")) notFound();
  const q = parseAuditQuery(searchParams);
  const { events, security, nameOf, people } = await loadOrgAudit(ctx.context.organisation_id, ctx.timezone, q, 300);
  return (
    <>
      <PageHeader
        title="Audit History"
        description="Every creation, change, approval and sign-in event, with who did it, how they identified themselves and from where. These records cannot be edited or deleted."
      />
      <AuditFilterBar basePath={basePath} q={q} people={people} />
      <Card>
        {q.tab === "changes" ? (
          events.length === 0 ? (
            <EmptyState title="No audit events match" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
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
                    <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), ctx.timezone)}</TD>
                    <TD>{nameOf(e.actor_user_id)}</TD>
                    <TD>
                      <Badge tone={methodTone(e.actor_method)}>{e.actor_method.replace("_", " ")}</Badge>
                    </TD>
                    <TD>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</TD>
                    <TD className="max-w-[420px] truncate text-ink-muted" title={e.action === "update" ? JSON.stringify(e.changes) : undefined}>
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
                <TH>Who</TH>
                <TH>Event</TH>
                <TH>Details</TH>
                <TH>From</TH>
              </tr>
            </THead>
            <tbody>
              {security.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), ctx.timezone)}</TD>
                  <TD>{nameOf(e.user_id)}</TD>
                  <TD className="font-medium">{SECURITY_LABELS[e.event_type] ?? e.event_type}</TD>
                  <TD className="max-w-[420px] text-ink-muted">{securityDetail(e, nameOf) || "—"}</TD>
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
