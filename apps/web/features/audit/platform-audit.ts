import "server-only";
import { listAuditEvents, listSecurityEvents } from "@hvems/api-client";
import type { AuditEvent, SecurityEvent } from "@hvems/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditRange, type AuditQuery } from "./query";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseOrgFilter(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "platform" || (s && UUID.test(s)) ? s : undefined;
}

/** Console audit (HVEMS staff with MFA see every organisation and the platform; RLS decides). */
export async function loadPlatformAudit(q: AuditQuery, organisation: string | undefined, limit: number) {
  const db = await createSupabaseServerClient();
  const range = auditRange(q, "Australia/Brisbane");
  const [events, security, { data: orgs }] = await Promise.all([
    q.tab === "changes"
      ? listAuditEvents(db, { organisationId: organisation, entityType: q.type || undefined, action: q.action || undefined, actorUserId: q.actor || undefined, ...range, limit })
      : Promise.resolve([] as AuditEvent[]),
    q.tab === "security" ? listSecurityEvents(db, { organisationId: organisation, eventType: q.event || undefined, ...range, limit }) : Promise.resolve([] as SecurityEvent[]),
    db.from("organisations").select("id, name").order("name"),
  ]);
  const ids = new Set<string>();
  for (const e of events) if (e.actor_user_id) ids.add(e.actor_user_id);
  for (const e of security) {
    if (e.user_id) ids.add(e.user_id);
    const m = (e.detail as { member_user_id?: unknown }).member_user_id;
    if (typeof m === "string") ids.add(m);
  }
  const [{ data: profiles }, { data: staff }] = ids.size
    ? await Promise.all([
        db.from("profiles").select("id, full_name, email").in("id", [...ids]),
        db.from("platform_staff").select("user_id").in("user_id", [...ids]),
      ])
    : [{ data: [] }, { data: [] }];
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
  const staffIds = new Set((staff ?? []).map((s) => s.user_id as string));
  const orgNames = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? "Deleted user") + (staffIds.has(id) ? " (HVEMS)" : "") : "System");
  const orgOf = (id: string | null) => (id ? (orgNames.get(id) ?? "Closed organisation") : "Platform");
  return { events, security, nameOf, orgOf, organisations: (orgs ?? []).map((o) => ({ value: o.id as string, label: o.name as string })) };
}
