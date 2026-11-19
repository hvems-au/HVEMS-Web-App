import type { PartsRequestStatus } from "@hvems/api-client";
import { Badge, type BadgeTone } from "@/components/ui/primitives";

export const PARTS_STATUS: Record<PartsRequestStatus, { label: string; tone: BadgeTone; help: string }> = {
  draft: { label: "Draft", tone: "grey", help: "Not sent yet." },
  submitted: { label: "Waiting for approval", tone: "amber", help: "Someone with a high enough Approval Limit needs to approve it." },
  approved: { label: "Approved", tone: "blue", help: "Ready to order." },
  rejected: { label: "Rejected", tone: "red", help: "Not approved." },
  ordered: { label: "Ordered", tone: "blue", help: "Ordered from the supplier." },
  partially_received: { label: "Partially received", tone: "amber", help: "Some parts have arrived." },
  received: { label: "Received", tone: "green", help: "Everything has arrived; fit it to the job." },
  closed: { label: "Closed", tone: "green", help: "Every part has been fitted, returned or cancelled." },
  cancelled: { label: "Cancelled", tone: "grey", help: "Cancelled before ordering." },
};

export function PartsStatusBadge({ status }: { status: PartsRequestStatus }) {
  return <Badge tone={PARTS_STATUS[status].tone}>{PARTS_STATUS[status].label}</Badge>;
}

export const qty = (n: number | string) => Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 });
export const aud = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
