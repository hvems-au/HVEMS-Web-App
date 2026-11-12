"use client";
import { Search } from "lucide-react";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Input, Select } from "@/components/ui/form";

/**
 * Search box. The list updates as you
 * type (short pause after the last key; no Enter needed) and when the type
 * changes. The URL keeps the search, so Back and refresh show the same results.
 */
export function OperatorEquipmentSearch({
  purpose,
  q,
  cls,
  classes,
}: {
  purpose: "prestart" | "issue" | null;
  q: string;
  cls: string;
  classes: [string, string][];
}) {
  return (
    <AutoFilterForm role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
      {purpose ? <input type="hidden" name="for" value={purpose} /> : null}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Rego, ID, make, model or QR code"
          aria-label="Search vehicles and equipment"
          className="h-12 pl-10 text-[16px]"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {classes.length > 1 ? (
        <Select name="class" defaultValue={cls} aria-label="Type" className="h-12 sm:w-56">
          <option value="">All types</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      ) : null}
    </AutoFilterForm>
  );
}
