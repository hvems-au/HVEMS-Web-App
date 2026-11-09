/**
 * Safety rules — SoW §3.4 and decisions #5, #6, D-07 (Confirmed).
 * The database (app.derive_condition) is authoritative; this mirror lets
 * clients — including the future offline mobile app — show the same outcome.
 */

export type DefectSeverity = "critical" | "minor" | "advisory";
export type AssetCondition = "active" | "needs_attention" | "out_of_service";

export type ConditionCauseKind =
  | "critical_defect"
  | "unverified_unsafe_report"
  | "critical_finding_awaiting_review"
  | "out_of_service_hold"
  | "awaiting_return_to_service"
  | "minor_defect"
  | "needs_attention_hold"
  | "overdue_service";

const OUT_OF_SERVICE_CAUSES: ReadonlySet<ConditionCauseKind> = new Set([
  "critical_defect",
  "unverified_unsafe_report",
  "critical_finding_awaiting_review",
  "out_of_service_hold",
  "awaiting_return_to_service",
]);

const NEEDS_ATTENTION_CAUSES: ReadonlySet<ConditionCauseKind> = new Set(["minor_defect", "needs_attention_hold"]);

export interface OpenCause {
  kind: ConditionCauseKind;
}

/** The most restrictive open cause decides the condition. */
export function deriveCondition(openCauses: readonly OpenCause[], opts: { overdueServiceSetsNeedsAttention?: boolean } = {}): AssetCondition {
  if (openCauses.some((c) => OUT_OF_SERVICE_CAUSES.has(c.kind))) return "out_of_service";
  if (
    openCauses.some(
      (c) => NEEDS_ATTENTION_CAUSES.has(c.kind) || (c.kind === "overdue_service" && opts.overdueServiceSetsNeedsAttention === true),
    )
  ) {
    return "needs_attention";
  }
  return "active";
}

/** Return-to-service clearance is available only when nothing but the RTS step itself keeps the asset out of service. */
export function canReturnToService(openCauses: readonly OpenCause[]): boolean {
  return !openCauses.some((c) => OUT_OF_SERVICE_CAUSES.has(c.kind) && c.kind !== "awaiting_return_to_service");
}

/** The cause a defect of a given severity opens; Advisory defects do not change condition. */
export function causeForSeverity(severity: DefectSeverity): ConditionCauseKind | null {
  return severity === "critical" ? "critical_defect" : severity === "minor" ? "minor_defect" : null;
}

export const PRE_START_RESULT: Record<DefectSeverity | "pass", string> = {
  critical: "Do not operate",
  minor: "Operate with care and follow your company's procedure",
  advisory: "Noted",
  pass: "No faults recorded",
};

/** Records-only disclaimer required on every warning (SoW §3.4). */
export const RECORDS_ONLY_NOTICE =
  "HVEMS records conditions and enforces digital permissions. It does not physically stop a vehicle or machine, and does not certify that an asset is roadworthy or fit for use.";

const SEVERITY_RANK: Record<DefectSeverity, number> = { advisory: 0, minor: 1, critical: 2 };

export type SeverityChangeCheck =
  | { allowed: true }
  | { allowed: false; reason: "clearance_authority_required" | "reason_required" | "evidence_required" };

/** Anyone can raise a severity; only Clearance Authority can lower it, with a reason (and evidence when lowering a Critical). */
export function checkSeverityChange(
  from: DefectSeverity,
  to: DefectSeverity,
  actor: { hasClearanceAuthority: boolean },
  input: { reason?: string; evidenceCount?: number },
): SeverityChangeCheck {
  if (SEVERITY_RANK[to] >= SEVERITY_RANK[from]) return { allowed: true };
  if (!actor.hasClearanceAuthority) return { allowed: false, reason: "clearance_authority_required" };
  if (!input.reason || input.reason.trim().length < 3) return { allowed: false, reason: "reason_required" };
  if (from === "critical" && (input.evidenceCount ?? 0) < 1) return { allowed: false, reason: "evidence_required" };
  return { allowed: true };
}

export const MINOR_REPAIR_DUE_DAYS = 7;
export const MAX_DEFERRAL_DAYS = 30;

export type DeferralCheck = { allowed: true } | { allowed: false; reason: "critical_cannot_be_deferred" | "clearance_authority_required" | "reason_required" | "beyond_deferral_limit" };

/** Deferral: Minor only, Clearance Authority, reason, new due ≤ original due + 30 days. */
export function checkDeferral(
  severity: DefectSeverity,
  actor: { hasClearanceAuthority: boolean },
  input: { reason?: string; originalDue: Date; newDue: Date },
): DeferralCheck {
  if (severity === "critical") return { allowed: false, reason: "critical_cannot_be_deferred" };
  if (!actor.hasClearanceAuthority) return { allowed: false, reason: "clearance_authority_required" };
  if (!input.reason || input.reason.trim().length < 3) return { allowed: false, reason: "reason_required" };
  const limit = input.originalDue.getTime() + MAX_DEFERRAL_DAYS * 86_400_000;
  if (input.newDue.getTime() > limit) return { allowed: false, reason: "beyond_deferral_limit" };
  return { allowed: true };
}
