"use client";
import * as React from "react";
import Link from "next/link";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { AssetListItem } from "@hvems/types";
import { ConditionBadge } from "@/components/condition";
import { formatNumber } from "@/lib/utils";

const col = createColumnHelper<AssetListItem>();

function meter(a: AssetListItem) {
  const parts: string[] = [];
  if (a.current_odometer_km !== null) parts.push(`${formatNumber(a.current_odometer_km)} km`);
  if (a.current_engine_hours !== null) parts.push(`${formatNumber(a.current_engine_hours, 1)} hours`);
  return parts.join(" · ") || "—";
}

export function AssetTable({ rows, base, operators = {} }: { rows: AssetListItem[]; base: string; operators?: Record<string, string> }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const columns = React.useMemo(
    () => [
      col.accessor("asset_number", {
        header: "Equipment",
        cell: (c) => {
          const a = c.row.original;
          const name = [a.year, a.make, a.model].filter(Boolean).join(" ");
          return (
            <Link href={`${base}/${a.id}`} className="group block">
              <span className="font-semibold text-brand-ink group-hover:underline">{c.getValue()}</span>
              {name ? <span className="block text-[12.5px] text-ink-muted">{name}</span> : null}
            </Link>
          );
        },
      }),
      col.accessor((a) => a.asset_class?.name ?? "", { id: "class", header: "Class" }),
      col.accessor((a) => a.registration_number ?? a.serial_number ?? a.vin ?? "", {
        id: "identifier",
        header: "Rego / serial",
        cell: (c) => {
          const a = c.row.original;
          return a.registration_number ? (
            <span className="font-medium">
              {a.registration_number} <span className="text-ink-subtle">{a.registration_state}</span>
            </span>
          ) : (
            <span className="font-medium">{a.serial_number ?? a.vin ?? "—"}</span>
          );
        },
      }),
      col.accessor((a) => a.site?.name ?? "", {
        id: "site",
        header: "Site",
        cell: (c) => {
          const s = c.row.original.site;
          return s ? (
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-[12px] text-ink-subtle">{[s.suburb, s.state].filter(Boolean).join(", ")}</p>
            </div>
          ) : (
            "—"
          );
        },
      }),
      col.accessor((a) => (a.current_operator_id ? (operators[a.current_operator_id] ?? "") : ""), {
        id: "operator",
        header: "Operator",
        cell: (c) => <span className={c.getValue() ? "font-medium" : "text-ink-subtle"}>{c.getValue() || "—"}</span>,
      }),
      col.display({ id: "meter", header: "Reading", cell: (c) => <span className="whitespace-nowrap">{meter(c.row.original)}</span> }),
      col.accessor("condition", {
        header: "Condition",
        cell: (c) => (c.row.original.archived_at ? <span className="text-[12px] font-semibold text-ink-subtle">Archived</span> : <ConditionBadge condition={c.getValue()} />),
      }),
    ],
    [base, operators],
  );
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="bg-surface-muted">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const sortable = h.column.getCanSort();
                return (
                  <th key={h.id} scope="col" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink-muted">
                    {sortable ? (
                      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-b border-stroke/70 hover:bg-surface-hover">
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-4 py-3 align-middle">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
