import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { CONDITION_LABELS, RECORDS_ONLY_NOTICE, type AssetCondition } from "@hvems/domain";
import { Badge } from "@/components/ui/primitives";

const TONE = { active: "green", needs_attention: "amber", out_of_service: "red" } as const;
const ICON = { active: CheckCircle2, needs_attention: AlertTriangle, out_of_service: AlertOctagon } as const;

export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  const Icon = ICON[condition];
  return (
    <Badge tone={TONE[condition]}>
      <Icon className="size-3.5" aria-hidden />
      {CONDITION_LABELS[condition]}
    </Badge>
  );
}

/** Asset-page warning (SoW §3.4: red/amber warnings, each stating the records-only limitation). */
export function ConditionBanner({ condition }: { condition: AssetCondition }) {
  if (condition === "active") return null;
  const red = condition === "out_of_service";
  const Icon = ICON[condition];
  return (
    <div
      role="alert"
      className={red ? "rounded-[10px] border border-danger/30 bg-danger-soft px-4 py-3" : "rounded-[10px] border border-[#f0b46b] bg-warn-soft px-4 py-3"}
    >
      <div className="flex gap-3">
        <Icon className={red ? "mt-0.5 size-5 shrink-0 text-danger" : "mt-0.5 size-5 shrink-0 text-[#c26100]"} aria-hidden />
        <div>
          <p className={red ? "font-semibold text-[#9b0b0c]" : "font-semibold text-[#8a4300]"}>
            {red ? "Broken/Out of service — do not operate" : "Needs attention — operate with care and follow your company's procedure"}
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">{RECORDS_ONLY_NOTICE}</p>
        </div>
      </div>
    </div>
  );
}
