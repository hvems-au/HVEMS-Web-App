"use client";
import * as React from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { AutoFilterForm } from "./auto-filter-form";

export type FilterField =
  | { kind: "select"; name: string; label: string; value?: string; all: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string; value?: string };

/**
 * A row of filters that apply as soon as one changes; filters live in the URL (shareable,
 * kept by Back). On phones the fields fold behind a "Filters" button showing how
 * many are applied; on larger screens they're always shown. `keep` carries other
 * query values, such as the current tab.
 */
export function FilterBar({ action, fields, keep = {} }: { action: string; fields: FilterField[]; keep?: Record<string, string> }) {
  const applied = fields.filter((f) => f.value).length;
  const [open, setOpen] = React.useState(false);
  const clearHref = Object.keys(keep).length ? `${action}?${new URLSearchParams(keep)}` : action;
  return (
    <div className="border-b border-stroke">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:hidden">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filter-fields">
          <SlidersHorizontal /> Filters{applied ? ` (${applied})` : ""}
        </Button>
        {applied ? (
          <Link href={clearHref} className="text-[13px] font-medium text-link hover:underline">
            Reset filters
          </Link>
        ) : null}
      </div>
      <AutoFilterForm
        id="filter-fields"
        action={action}
        className={cn("grid grid-cols-2 items-end gap-3 px-4 pb-4 sm:flex sm:flex-wrap sm:pt-4", open ? "grid" : "hidden sm:flex")}
      >
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fields.map((f) => (
          <label key={f.name} className={cn("flex min-w-0 flex-col gap-1 text-[13px] font-medium text-ink sm:min-w-[150px]", f.kind === "select" && "col-span-2 sm:col-span-1")}>
            {f.label}
            {f.kind === "date" ? (
              <Input type="date" name={f.name} defaultValue={f.value ?? ""} className="h-10" />
            ) : (
              <Select name={f.name} defaultValue={f.value ?? ""} className="h-10">
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
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
          {applied ? (
            <Link href={clearHref} className="hidden pb-2.5 text-[13px] font-medium text-link hover:underline sm:inline">
              Reset
            </Link>
          ) : null}
        </div>
      </AutoFilterForm>
    </div>
  );
}
