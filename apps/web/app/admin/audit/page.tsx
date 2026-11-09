import type { Metadata } from "next";
import { listPlatformAuditEvents } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ENTITY_LABELS, methodTone, summarise } from "@/features/audit/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Platform-wide audit history (SoW §2.3, §3.9). Company and provider admins see
 * only their own organisation's events; HVEMS staff see every organisation plus
 * platform-level events. The database decides (audit_events_read policy).
 */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const orgParam = firstParam(sp.org);
  const organisationId = orgParam === "platform" || (orgParam && UUID.test(orgParam)) ? orgParam : undefined;
  const typeParam = firstParam(sp.type);
  const entityType = typeParam && typeParam in ENTITY_LABELS ? typeParam : undefined;

  const db = await createSupabaseServerClient();
  const [events, { data: orgs }] = await Promise.all([
    listPlatformAuditEvents(db, { organisationId, entityType, limit: 300 }),
    db.from("organisations").select("id, name").order("name"),
  ]);

  const actorIds = [...new Set(events.map((e) => e.actor_user_id).filter((id): id is string => !!id))];
  const [{ data: profiles }, { data: staff }] = actorIds.length
    ? await Promise.all([
        db.from("profiles").select("id, full_name, email").in("id", actorIds),
        db.from("platform_staff").select("user_id").in("user_id", actorIds),
      ])
    : [{ data: [] }, { data: [] }];
  const who = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
  const staffIds = new Set((staff ?? []).map((s) => s.user_id as string));
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));

  return (
    <>
      <PageHeader
        title="Audit History"
        description="Every creation, change, approval and support access across all organisations and the platform itself. These records cannot be edited or deleted."
      />
      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          <label className="flex min-w-[220px] flex-col gap-1 text-[13px] font-medium text-ink">
            Organisation
            <Select name="org" defaultValue={organisationId ?? ""}>
              <option value="">All organisations and platform</option>
              <option value="platform">Platform only (staff, settings)</option>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-[200px] flex-col gap-1 text-[13px] font-medium text-ink">
            Record
            <Select name="type" defaultValue={entityType ?? ""}>
              <option value="">All records</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </Card>
      <Card>
        {events.length === 0 ? (
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
              </tr>
            </THead>
            <tbody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at))}</TD>
                  <TD>{e.organisation_id ? (orgName.get(e.organisation_id) ?? "Closed organisation") : <span className="text-ink-subtle">Platform</span>}</TD>
                  <TD>
                    {e.actor_user_id ? (who.get(e.actor_user_id) ?? "Deleted user") : "System"}
                    {e.actor_user_id && staffIds.has(e.actor_user_id) ? (
                      <Badge tone="grey" className="ml-2">
                        HVEMS
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge tone={methodTone(e.actor_method)}>{e.actor_method.replace("_", " ")}</Badge>
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
