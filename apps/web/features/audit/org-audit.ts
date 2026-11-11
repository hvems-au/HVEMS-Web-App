import "server-only";
import { listAuditEvents, listMembers } from "@hvems/api-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditRange, type AuditQuery } from "./query";

/** One organisation's audit history (changes) for the viewer and the CSV export (RLS: audit.view). Security events are Super Admin only. */
export async function loadOrgAudit(orgId: string, timeZone: string, q: AuditQuery, limit: number) {
  const db = await createSupabaseServerClient();
  const range = auditRange(q, timeZone);
  const [members, events] = await Promise.all([
    listMembers(db, orgId),
    listAuditEvents(db, { organisationId: orgId, entityType: q.type || undefined, action: q.action || undefined, actorUserId: q.actor || undefined, ...range, limit }),
  ]);
  const names = new Map(members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || "Member"]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? "HVEMS staff or former member") : "System");
  const people = members.map((m) => ({ value: m.user_id, label: m.profile?.full_name || m.profile?.email || "Member" }));
  return { events, nameOf, people };
}
