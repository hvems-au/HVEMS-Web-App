import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

export type FilterField =
  | { kind: "select"; name: string; label: string; value?: string; all: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string; value?: string };

/**
 * A row of filters that submits as a plain GET form (works without JavaScript).
 * `keep` holds query values to carry over, such as the current tab.
 */
export function FilterBar({ action, fields, keep = {} }: { action: string; fields: FilterField[]; keep?: Record<string, string> }) {
  const active = fields.some((f) => f.value);
  const clearHref = Object.keys(keep).length ? `${action}?${new URLSearchParams(keep)}` : action;
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 border-b border-stroke p-4">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <label key={f.name} className="flex min-w-[150px] flex-col gap-1 text-[13px] font-medium text-ink">
          {f.label}
          {f.kind === "date" ? (
            <Input type="date" name={f.name} defaultValue={f.value ?? ""} className="h-9" />
          ) : (
            <Select name={f.name} defaultValue={f.value ?? ""} className="h-9">
              <option value="">{f.all}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </label>
      ))}
      <Button type="submit" variant="secondary" size="sm" className="h-9">
        Filter
      </Button>
      {active ? (
        <Link href={clearHref} className="pb-2 text-[13px] text-link hover:underline">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
