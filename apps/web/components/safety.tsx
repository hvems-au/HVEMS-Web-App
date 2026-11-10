import { DEFECT_SEVERITY_LABELS, INSPECTION_RESULT_LABELS, type DefectSeverity, type InspectionResultValue } from "@hvems/domain";
import { Badge } from "@/components/ui/primitives";

const RESULT_TONE = { pass: "green", pass_with_faults: "amber", fail: "red" } as const;
const SEVERITY_TONE = { critical: "red", minor: "amber", advisory: "grey" } as const;

export function ResultBadge({ result }: { result: InspectionResultValue }) {
  return <Badge tone={RESULT_TONE[result]}>{INSPECTION_RESULT_LABELS[result]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{DEFECT_SEVERITY_LABELS[severity]}</Badge>;
}
