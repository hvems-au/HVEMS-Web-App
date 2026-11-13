"use client";
import * as React from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { AutoFilterForm } from "./auto-filter-form";

export type FilterField =
  | { kind: "select"; name: string; label: string; value?: string; all: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string; value?: string };

/**
 * Search and filters that apply as you go: typing updates after a short pause;
 * dropdowns (which you can type into) and dates apply at once. Everything lives
 * in the URL (shareable, kept by Back). On phones the search stays visible and
 * the other filters fold behind a "Filters" button showing how many are applied.
 * `keep` carries other query values, such as the current tab.
 */
export function FilterBar({
  action,
  fields,
  keep = {},
  search,
}: {
  action: string;
  fields: FilterField[];
  keep?: Record<string, string>;
  search?: { name?: string; value?: string; placeholder: string };
}) {
  const applied = fields.filter((f) => f.value).length;
  const [open, setOpen] = React.useState(false);
  const clearHref = Object.keys(keep).length ? `${action}?${new URLSearchParams(keep)}` : action;
  const anything = applied > 0 || !!search?.value;
  return (
    <div className="border-b border-stroke">
      <AutoFilterForm action={action} className="flex flex-wrap items-end gap-x-3 gap-y-3 p-4 xl:flex-nowrap">
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {/* Phones: search and a Filters button on one line; the rest folds. Larger screens: one row. */}
        <div className="flex w-full items-end gap-2 sm:w-auto xl:max-w-[300px] xl:min-w-0 xl:flex-[1.6]">
          {search ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-medium text-ink sm:w-52 sm:flex-none xl:w-full">
              <span className="hidden sm:block">Search</span>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <Input
                  name={search.name ?? "q"}
                  defaultValue={search.value ?? ""}
                  placeholder={search.placeholder}
                  aria-label={search.placeholder}
                  autoComplete="off"
                  enterKeyHint="search"
                  className={cn("h-10 pl-9 text-[13.5px]", SEARCH_FIELD)}
                />
              </span>
            </label>
          ) : (
            <span className="flex-1 sm:hidden" />
          )}
          {fields.length ? (
            <Button type="button" variant="secondary" size="sm" className="h-10 sm:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filter-fields">
              <SlidersHorizontal /> Filters{applied ? ` (${applied})` : ""}
            </Button>
          ) : null}
          {anything ? (
            <Link href={clearHref} className="shrink-0 px-1 pb-2.5 text-[13px] font-medium text-link hover:underline sm:hidden">
              Reset
            </Link>
          ) : null}
        </div>
        <div id="filter-fields" className={cn("w-full grid-cols-2 items-end gap-3 sm:contents", open ? "grid" : "hidden")}>
          {fields.map((f) =>
            f.kind === "date" ? (
              <label key={f.name} className="flex min-w-0 flex-col gap-1 text-[13px] font-medium text-ink sm:w-[136px] xl:w-auto xl:max-w-[160px] xl:min-w-[128px] xl:flex-1">
                {f.label}
                <Input type="date" name={f.name} defaultValue={f.value ?? ""} className="h-10 text-[13.5px]" />
              </label>
            ) : (
              <div key={f.name} className="col-span-2 flex min-w-0 flex-col gap-1 text-[13px] font-medium text-ink sm:col-span-1 sm:w-40 xl:w-auto xl:max-w-[210px] xl:min-w-0 xl:flex-1">
                <span>{f.label}</span>
                <SearchableSelect name={f.name} value={f.value} all={f.all} options={f.options} label={f.label} />
              </div>
            ),
          )}
        </div>
        {anything ? (
          <Link href={clearHref} className="hidden shrink-0 pb-2.5 text-[13px] font-medium text-link hover:underline sm:inline">
            Reset
          </Link>
        ) : null}
      </AutoFilterForm>
    </div>
  );
}
