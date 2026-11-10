import { notFound } from "next/navigation";
import { listAuditEvents, listMembers } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import type { OrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ENTITY_LABELS, methodTone, summarise } from "@/features/audit/format";

/** SoW §3.9: Owners and Administrators can view their company's audit history. Records are append-only. */
export async function AuditPage({ ctx }: { ctx: OrgContext }) {
  if (!can(ctx.capabilities, "audit.view")) notFound();
  const orgId = ctx.context.organisation_id;
  const db = await createSupabaseServerClient();
  const [events, members] = await Promise.all([listAuditEvents(db, { organisationId: orgId, limit: 200 }), listMembers(db, orgId)]);
  const who = new Map(members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || "Member"]));
  return (
    <>
      <PageHeader title="Audit History" description="Every creation, change, approval and support access, with who did it and how they identified themselves. These records cannot be edited or deleted." />
      <Card>
        {events.length === 0 ? (
          <EmptyState title="No audit events yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Identified by</TH>
                <TH>Record</TH>
                <TH>What happened</TH>
              </tr>
            </THead>
            <tbody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), ctx.timezone)}</TD>
                  <TD>{e.actor_user_id ? (who.get(e.actor_user_id) ?? "HVEMS staff or former member") : "System"}</TD>
                  <TD>
                    <Badge tone={methodTone(e.actor_method)}>
                      {e.actor_method.replace("_", " ")}
                    </Badge>
                  </TD>
                  <TD>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</TD>
                  <TD className="max-w-[420px] truncate text-ink-muted">
                    <span className="mr-1 font-medium text-ink capitalize">{e.action}</span>
                    {summarise(e.action, e.changes)}
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
