/** Workforce (2C, CS-19): qualifications, leave and allocation warnings. */
export const QUALIFICATION_KINDS = ["trade_certificate", "licence", "high_risk_work", "induction", "first_aid", "manufacturer_training", "other"] as const;
export type QualificationKind = (typeof QUALIFICATION_KINDS)[number];
export const QUALIFICATION_LABELS: Record<QualificationKind, string> = {
  trade_certificate: "Trade certificate",
  licence: "Licence",
  high_risk_work: "High-risk work licence",
  induction: "Induction",
  first_aid: "First aid",
  manufacturer_training: "Manufacturer training",
  other: "Other",
};
/** Hints for the "label" box per kind. */
export const QUALIFICATION_LABEL_HINTS: Record<QualificationKind, string> = {
  trade_certificate: "e.g. Cert III Heavy Commercial Vehicle",
  licence: "e.g. HR, Electrical",
  high_risk_work: "e.g. Forklift (LF), Crane (C2)",
  induction: "e.g. site or client name",
  first_aid: "e.g. HLTAID011",
  manufacturer_training: "e.g. CAT engines",
  other: "Name of the qualification",
};
/** Kinds a work order can require ("other" is too vague to check). */
export const REQUIRABLE_QUALIFICATIONS = QUALIFICATION_KINDS.filter((k) => k !== "other");

/** "Licence (HR)", "First aid", or the name of an "other" one. Mirrors app.qualification_label. */
export function qualificationText(q: { kind: QualificationKind; label: string | null }): string {
  if (q.kind === "other") return q.label ?? "Qualification";
  return `${QUALIFICATION_LABELS[q.kind]}${q.label ? ` (${q.label})` : ""}`;
}

export const LEAVE_KINDS = ["annual", "sick", "training", "other"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_LABELS: Record<LeaveKind, string> = { annual: "Annual leave", sick: "Sick leave", training: "Training", other: "Other leave" };

/** Member roles that can be given work orders. */
export const WORKFORCE_ROLES = ["owner", "administrator", "fleet_manager", "technician"] as const;

export type AllocationWarning = { code: "unavailable" | "on_leave" | "no_qualification"; message: string };
