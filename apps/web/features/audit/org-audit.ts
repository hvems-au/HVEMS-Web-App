import "server-only";
import { listAuditEvents, listMembers, listSecurityEvents } from "@hvems/api-client";
import type { AuditEvent, SecurityEvent } from "@hvems/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditRange, type AuditQuery } from "./query";

/** One organisation's audit and security events for the viewer and the CSV export (RLS: audit.view). */
export async function loadOrgAudit(orgId: string, timeZone: string, q: AuditQuery, limit: number) {
  const db = await createSupabaseServerClient();
  const range = auditRange(q, timeZone);
  const [members, events, security] = await Promise.all([
    listMembers(db, orgId),
    q.tab === "changes"
      ? listAuditEvents(db, { organisationId: orgId, entityType: q.type || undefined, action: q.action || undefined, actorUserId: q.actor || undefined, ...range, limit })
      : Promise.resolve([] as AuditEvent[]),
    q.tab === "security" ? listSecurityEvents(db, { organisationId: orgId, eventType: q.event || undefined, ...range, limit }) : Promise.resolve([] as SecurityEvent[]),
  ]);
  const names = new Map(members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || "Member"]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? "HVEMS staff or former member") : "System");
  const people = members.map((m) => ({ value: m.user_id, label: m.profile?.full_name || m.profile?.email || "Member" }));
  return { events, security, nameOf, people };
}
