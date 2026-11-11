import { startOfDayInZone, toCsv, formatDateTimeAU } from "@hvems/domain";
import type { AuditEvent, SecurityEvent } from "@hvems/types";
import { ENTITY_LABELS, summarise } from "./format";

/** Audit filters from the page's query string (AUD-02). Unknown values are ignored. */
export interface AuditQuery {
  tab: "changes" | "security";
  from: string;
  to: string;
  type: string;
  action: string;
  actor: string;
  event: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUDIT_ACTIONS = ["insert", "update", "delete", "archive", "import"] as const;
export const ACTION_LABELS: Record<string, string> = { insert: "Created", update: "Changed", delete: "Deleted", archive: "Archived", import: "Imported" };

export function parseAuditQuery(sp: Record<string, string | string[] | undefined>): AuditQuery {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  return {
    tab: one("tab") === "security" ? "security" : "changes",
    from: DATE.test(one("from")) ? one("from") : "",
    to: DATE.test(one("to")) ? one("to") : "",
    type: one("type") in ENTITY_LABELS ? one("type") : "",
    action: (AUDIT_ACTIONS as readonly string[]).includes(one("action")) ? one("action") : "",
    actor: UUID.test(one("actor")) ? one("actor") : "",
    event: one("event") in SECURITY_LABELS ? one("event") : "",
  };
}

/** Date range as instants: "to" includes the whole day. */
export function auditRange(q: AuditQuery, timeZone: string): { from?: string; to?: string } {
  const next = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  return {
    from: q.from ? startOfDayInZone(q.from, timeZone).toISOString() : undefined,
    to: q.to ? startOfDayInZone(next(q.to), timeZone).toISOString() : undefined,
  };
}

export function auditQueryString(q: Partial<AuditQuery>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v && !(k === "tab" && v === "changes")) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Sign-in and security events in plain words. */
export const SECURITY_LABELS: Record<string, string> = {
  password_sign_in_failed: "Wrong password",
  account_locked: "Account locked",
  sign_in_unlocked: "Sign-in unlocked",
  hvems_staff_sign_in_unlocked: "Sign-in unlocked by HVEMS",
  mfa_recovery_codes_generated: "Recovery codes created",
  mfa_recovery_code_used: "Recovery code used",
  mfa_recovery_code_failed: "Wrong recovery code",
  member_mfa_reset: "MFA reset",
  hvems_staff_mfa_reset: "MFA reset by HVEMS",
  member_role_changed: "Role changed",
  member_removed: "Member removed",
  grant_assigned: "Grant assigned",
  grant_revoked: "Grant revoked",
  support_access_started: "HVEMS support access started",
  support_access_ended: "HVEMS support access ended",
  support_access_ended_by_owner: "HVEMS support access ended by the Owner",
  hvems_staff_viewed_records: "HVEMS viewed records",
  driver_pin_reset: "Operator PIN reset",
  driver_sign_in_failed: "Wrong operator PIN",
  driver_signed_in: "Operator signed in",
  driver_pin_set: "Operator PIN set",
  password_changed: "Password changed",
  support_pin_changed: "Support PIN changed",
  support_pin_failed: "Wrong support PIN",
};

export function securityDetail(e: SecurityEvent, nameOf: (id: string | null | undefined) => string | null): string {
  const d = e.detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.member_user_id === "string") parts.push(`For ${nameOf(d.member_user_id) ?? "a member"}`);
  if (typeof d.reason === "string" && d.reason) parts.push(`Reason: ${d.reason}`);
  if (typeof d.failed_count === "number") parts.push(`${d.failed_count} in a row`);
  if (typeof d.until === "string") parts.push(`Until ${formatDateTimeAU(new Date(d.until))}`);
  if (typeof d.from === "string" && typeof d.to === "string") parts.push(`${d.from} → ${d.to}`);
  if (typeof d.email === "string") parts.push(`Email tried: ${d.email}`);
  if (typeof d.area === "string") parts.push(`Area: ${d.area}`);
  return parts.join(" · ");
}

export function contextText(c: AuditEvent["context"]): string {
  if (!c) return "";
  return [c.portal, c.ip].filter(Boolean).join(" · ");
}

export function auditCsv(events: AuditEvent[], nameOf: (id: string | null) => string, timeZone: string, orgOf?: (id: string | null) => string): string {
  return toCsv([
    ["When", ...(orgOf ? ["Organisation"] : []), "Who", "Identified by", "Record", "Record id", "Action", "Details", "Portal", "IP address", "Browser"],
    ...events.map((e) => [
      formatDateTimeAU(new Date(e.occurred_at), timeZone),
      ...(orgOf ? [orgOf(e.organisation_id)] : []),
      nameOf(e.actor_user_id),
      e.actor_method.replace("_", " "),
      ENTITY_LABELS[e.entity_type] ?? e.entity_type,
      e.entity_id ?? "",
      ACTION_LABELS[e.action] ?? e.action,
      e.action === "update" ? JSON.stringify(e.changes) : summarise(e.action, e.changes),
      e.context?.portal ?? "",
      e.context?.ip ?? "",
      e.context?.user_agent ?? "",
    ]),
  ]);
}

export function securityCsv(events: SecurityEvent[], nameOf: (id: string | null | undefined) => string | null, timeZone: string, orgOf?: (id: string | null) => string): string {
  return toCsv([
    ["When", ...(orgOf ? ["Organisation"] : []), "Who", "Event", "Details", "Portal", "IP address", "Browser"],
    ...events.map((e) => [
      formatDateTimeAU(new Date(e.occurred_at), timeZone),
      ...(orgOf ? [orgOf(e.organisation_id)] : []),
      nameOf(e.user_id) ?? "",
      SECURITY_LABELS[e.event_type] ?? e.event_type,
      securityDetail(e, nameOf),
      e.context?.portal ?? "",
      e.context?.ip ?? "",
      e.context?.user_agent ?? "",
    ]),
  ]);
}
