import { Car, CircleDot, CircleHelp, Cog, Disc, Droplets, OctagonAlert, ShieldCheck, Wrench, Zap, type LucideIcon } from "lucide-react";
import { issueCategoryLabel } from "@hvems/domain";
import { cn } from "@/lib/utils";

export const ISSUE_CATEGORY_ICON: Record<string, LucideIcon> = {
  breakdown: OctagonAlert,
  engine: Cog,
  brakes: Disc,
  tyres: CircleDot,
  electrical: Zap,
  hydraulics: Wrench,
  leak: Droplets,
  damage: Car,
  safety_equipment: ShieldCheck,
  other: CircleHelp,
};

/** Small icon + label for tables and detail pages. Pre-start faults have no category. */
export function IssueCategoryTag({ value, source, className }: { value: string | null | undefined; source?: string | null; className?: string }) {
  const label = issueCategoryLabel(value);
  if (!label || !value) return <span className={cn("text-ink-subtle", className)}>{source === "operator_report" ? "Operator report" : "Pre-start"}</span>;
  const Icon = ISSUE_CATEGORY_ICON[value] ?? CircleHelp;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", value === "breakdown" ? "font-semibold text-danger-ink" : "text-ink", className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
