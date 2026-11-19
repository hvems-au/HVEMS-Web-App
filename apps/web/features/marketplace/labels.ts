/** Marketplace labels and formatting. Plain module: safe on server and client. */
import type { ProposalStatus, ProposalTerms, PublicJob } from "@hvems/api-client";

export { JOB_TYPES, PROVIDER_CATEGORIES, type JobType, type ProviderCategory } from "@hvems/api-client";

export const JOB_STATUS: Record<PublicJob["status"], { label: string; tone: "green" | "amber" | "grey" | "blue" | "red" }> = {
  open: { label: "Open", tone: "green" },
  engaged: { label: "Engaged", tone: "blue" },
  closed: { label: "Closed", tone: "grey" },
  cancelled: { label: "Withdrawn", tone: "grey" },
  expired: { label: "Expired", tone: "amber" },
};

export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone: "green" | "amber" | "grey" | "blue" | "red" }> = {
  active: { label: "Active", tone: "green" },
  withdrawn: { label: "Withdrawn", tone: "grey" },
  expired: { label: "Expired", tone: "amber" },
  not_selected: { label: "Not selected", tone: "grey" },
  accepted: { label: "Accepted", tone: "blue" },
};

export const VERIFICATION_STATUS = {
  draft: { label: "Not submitted", tone: "grey" },
  submitted: { label: "Waiting for review", tone: "amber" },
  verified: { label: "Verified", tone: "green" },
  rejected: { label: "Not approved", tone: "red" },
  suspended: { label: "Suspended", tone: "red" },
} as const;

export const BADGE_LABELS: Record<string, string> = { abn: "ABN checked", public_liability: "Public liability insurance", qualification: "Qualification" };

export const SHARE_FIELDS = [
  { key: "class", label: "Class" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year" },
  { key: "registration", label: "Registration" },
  { key: "vin", label: "VIN" },
  { key: "serial_number", label: "Serial number" },
  { key: "odometer_km", label: "Odometer (km)" },
  { key: "engine_hours", label: "Hour meter (hours)" },
] as const;

export const aud = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents % 100 ? 2 : 0 });

export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function budgetText(j: Pick<PublicJob, "budget_min_cents" | "budget_max_cents">): string | null {
  if (j.budget_min_cents === null && j.budget_max_cents === null) return null;
  if (j.budget_min_cents !== null && j.budget_max_cents !== null) return `${aud(j.budget_min_cents)} – ${aud(j.budget_max_cents)}`;
  return j.budget_max_cents !== null ? `Up to ${aud(j.budget_max_cents)}` : `From ${aud(j.budget_min_cents)}`;
}

export function windowText(j: Pick<PublicJob, "preferred_from" | "preferred_to" | "preferred_time">): string | null {
  const d = j.preferred_from ? (j.preferred_to && j.preferred_to !== j.preferred_from ? `${dmy(j.preferred_from)} – ${dmy(j.preferred_to)}` : dmy(j.preferred_from)) : null;
  return [d, j.preferred_time].filter(Boolean).join(", ") || null;
}

export function priceText(t: Pick<ProposalTerms, "price_basis" | "amount_cents" | "amount_max_cents" | "hourly_rate_cents" | "callout_cents" | "gst_applies">): string {
  const gst = t.gst_applies ? " + GST" : " (no GST)";
  if (t.price_basis === "fixed") return `${aud(t.amount_cents)} fixed${gst}`;
  if (t.price_basis === "estimate") return `${aud(t.amount_cents)} – ${aud(t.amount_max_cents)} estimate${gst}`;
  return `${aud(t.hourly_rate_cents)}/hour${t.callout_cents ? ` + ${aud(t.callout_cents)} call-out` : ""}${gst}`;
}

export function availabilityText(t: Pick<ProposalTerms, "available_from" | "available_to" | "arrival_minutes">): string {
  if (t.arrival_minutes) return `Arrives in ${t.arrival_minutes} min`;
  if (!t.available_from) return "—";
  return t.available_to && t.available_to !== t.available_from ? `${dmy(t.available_from)} – ${dmy(t.available_to)}` : dmy(t.available_from);
}

export function closesText(iso: string, tz: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Closed";
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `Closes in ${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 48) return `Closes in ${h} h`;
  return `Closes ${new Date(iso).toLocaleDateString("en-AU", { timeZone: tz })}`;
}

/** An open job past its closing time shows as expired until the next sweep marks it. */
export function effectiveJobStatus(j: { status: PublicJob["status"]; closes_at: string }): PublicJob["status"] {
  return j.status === "open" && Date.parse(j.closes_at) <= Date.now() ? "expired" : j.status;
}
