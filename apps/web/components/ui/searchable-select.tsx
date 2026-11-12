"use client";
import * as React from "react";
import { Popover as P } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { useAutoFilter } from "@/components/auto-filter-form";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string };

/**
 * A dropdown you can type into: the list narrows as you type (anywhere in the
 * label, any case), arrow keys move, Enter picks. Inside an AutoFilterForm the
 * choice applies straight away. The value is submitted as a hidden input, so it
 * also works in a plain form.
 */
export function SearchableSelect({
  name,
  value,
  all,
  options,
  label,
  className,
}: {
  name: string;
  value?: string;
  /** Text for "no filter", e.g. "All equipment". */
  all: string;
  options: SearchableOption[];
  label: string;
  className?: string;
}) {
  const apply = useAutoFilter();
  const [current, setCurrent] = React.useState(value ?? "");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  // Keep in step when the server sends a different value (Reset, Back).
  const [prop, setProp] = React.useState(value ?? "");
  if ((value ?? "") !== prop) {
    setProp(value ?? "");
    setCurrent(value ?? "");
  }

  const all_: SearchableOption = { value: "", label: all };
  const q = query.trim().toLowerCase();
  const shown = [all_, ...options].filter((o) => !q || o.value === "" || o.label.toLowerCase().includes(q)).slice(0, 200);
  const selectedLabel = options.find((o) => o.value === current)?.label ?? all;

  const choose = (v: string) => {
    setCurrent(v);
    setOpen(false);
    setQuery("");
    apply?.({ [name]: v });
  };

  return (
    <>
      <input type="hidden" name={name} value={current} />
      <P.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setQuery("");
            setActive(0);
          }
        }}
      >
        <P.Trigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${selectedLabel}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[8px] border border-stroke-strong bg-surface px-3 text-left text-[14px] text-ink transition-colors hover:border-ink-subtle focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
              current && "border-brand/60 bg-brand-soft/40",
              className,
            )}
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </P.Trigger>
        <P.Portal>
          <P.Content
            align="start"
            sideOffset={4}
            collisionPadding={12}
            className="z-50 w-[max(var(--radix-popover-trigger-width),240px)] overflow-hidden rounded-[10px] border border-stroke bg-surface-raised shadow-[var(--elev-pop)] data-[state=open]:animate-in data-[state=open]:fade-in-0"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).querySelector("input")?.focus();
            }}
          >
            <div className="relative border-b border-stroke">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, shown.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const o = shown[active];
                    if (o) choose(o.value);
                  }
                }}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                aria-controls={listId}
                autoComplete="off"
                className="h-10 w-full bg-transparent pr-3 pl-9 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>
            <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1">
              {shown.length <= 1 && q ? <li className="px-3 py-2.5 text-[13.5px] text-ink-muted">No matches</li> : null}
              {shown.map((o, i) => (
                <li
                  key={o.value || "__all"}
                  role="option"
                  aria-selected={o.value === current}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[14px]",
                    i === active ? "bg-surface-hover text-ink" : "text-ink",
                    o.value === "" && "text-ink-muted",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === current ? <Check className="size-4 shrink-0 text-brand-ink" aria-hidden /> : null}
                </li>
              ))}
            </ul>
          </P.Content>
        </P.Portal>
      </P.Root>
    </>
  );
}
