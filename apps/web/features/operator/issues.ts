import type { BadgeTone } from "@/components/ui/primitives";

/** The defect fields an operator's own report shows (no internal notes, costs or work order details). */
export const ISSUE_COLUMNS =
  "id, organisation_id, asset_id, title, description, status, severity, source, reported_urgency, reported_at, triaged_at, deferred_until, closed_at, evidence_paths, inspection_id, asset:assets(asset_number, make, model)";

export interface OperatorIssue {
  id: string;
  organisation_id: string;
  asset_id: string;
  title: string;
  description: string | null;
  status: "open" | "closed" | "repaired" | "dismissed" | "merged";
  severity: "critical" | "minor" | "advisory";
  source: "prestart" | "operator_report";
  reported_urgency: "stop" | "soon" | "not_urgent" | null;
  reported_at: string;
  triaged_at: string | null;
  deferred_until: string | null;
  closed_at: string | null;
  evidence_paths: string[];
  inspection_id: string | null;
  asset: { asset_number: string; make: string | null; model: string | null } | null;
}

/** Operator-friendly progress, from the existing defect lifecycle. */
export function issueProgress(d: Pick<OperatorIssue, "status" | "triaged_at" | "deferred_until">): { label: string; tone: BadgeTone; help: string } {
  switch (d.status) {
    case "repaired":
      return { label: "Repaired", tone: "green", help: "The repair has been recorded." };
    case "dismissed":
      return { label: "Closed: no fault found", tone: "grey", help: "A manager checked it and found nothing to repair." };
    case "merged":
      return { label: "Combined", tone: "grey", help: "It was the same as another report and is being handled there." };
    case "closed":
      return { label: "Closed", tone: "grey", help: "This report is closed." };
    default:
      if (!d.triaged_at) return { label: "Received", tone: "blue", help: "Your report has been received and is waiting for a manager to review it." };
      if (d.deferred_until) return { label: "Repair scheduled", tone: "amber", help: "A manager reviewed it and scheduled the repair." };
      return { label: "Being looked at", tone: "amber", help: "A manager reviewed it and it's being dealt with." };
  }
}

export const URGENCY_LABEL = { stop: "Unsafe: stop using it", soon: "Needs attention soon", not_urgent: "Not urgent" } as const;
