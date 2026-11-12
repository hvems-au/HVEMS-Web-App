import type { AssetListItem } from "@hvems/types";
import { ConditionBadge } from "@/components/condition";

/** The selected vehicle or machine, kept in view throughout the operator's workflow. */
export function OperatorAssetHeader({ asset }: { asset: AssetListItem }) {
  const name = [asset.year, asset.make, asset.model].filter(Boolean).join(" ");
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-[12px] border border-stroke bg-surface px-4 py-3 shadow-card">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink-muted">{asset.asset_class?.name}</p>
        <p className="text-[20px] leading-tight font-bold break-words text-ink">{asset.asset_number}</p>
        <p className="text-[14px] break-words text-ink-muted">
          {name}
          {asset.registration_number ? `${name ? " · " : ""}Rego ${asset.registration_number}${asset.registration_state ? ` ${asset.registration_state}` : ""}` : ""}
        </p>
      </div>
      <ConditionBadge condition={asset.condition} />
    </div>
  );
}

/** What the asset's condition means for an operator, in plain words. */
export function restrictionText(condition: AssetListItem["condition"]): { tone: "danger" | "warn"; text: string } | null {
  if (condition === "out_of_service") return { tone: "danger", text: "Out of service: do not operate. You can still report an issue." };
  if (condition === "needs_attention") return { tone: "warn", text: "Needs attention: check the open issues below before you use it." };
  return null;
}
