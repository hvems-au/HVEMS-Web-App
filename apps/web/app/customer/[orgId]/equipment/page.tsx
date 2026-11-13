import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Upload, Download, Gauge } from "lucide-react";
import { getAssetConditionCounts, getPersonNames, listAssets, countPendingReadings } from "@hvems/api-client";
import type { AssetCondition } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
import { Card, EmptyState } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { AssetTable } from "./asset-table";

export const metadata: Metadata = { title: "Equipment" };

const TABS: { key: string; label: string; condition?: AssetCondition; archived?: boolean }[] = [
  { key: "all", label: "All Equipment" },
  { key: "active", label: "Active", condition: "active" },
  { key: "needs_attention", label: "Needs attention", condition: "needs_attention" },
  { key: "out_of_service", label: "Broken/Out of service", condition: "out_of_service" },
  { key: "archived", label: "Archived", archived: true },
];
const PAGE_SIZE = 25;

export default async function EquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const tabKey = firstParam(sp.condition) ?? (firstParam(sp.status) === "archived" ? "archived" : "all");
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0]!;
  const q = firstParam(sp.q) ?? "";
  const page = Math.max(Number(firstParam(sp.page) ?? 1) || 1, 1);

  const db = await createSupabaseServerClient();
  const pendingReadings = can(ctx.capabilities, "meter_readings.accept") ? await countPendingReadings(db, orgId) : 0;
  const [counts, { rows, total }] = await Promise.all([
    getAssetConditionCounts(db, orgId),
    listAssets(db, { organisationId: orgId, search: q, condition: tab.condition, status: tab.archived ? "archived" : "current", page, pageSize: PAGE_SIZE }),
  ]);
  const operators = Object.fromEntries(
    await getPersonNames(
      db,
      rows.map((r) => r.current_operator_id),
    ),
  );
  const base = `/customer/${orgId}/equipment`;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { condition: tab.condition, status: tab.archived ? "archived" : undefined, q: q || undefined, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const manage = can(ctx.capabilities, "assets.manage");
  // Export what's on screen: the current tab and search.
  const exportQuery = new URLSearchParams();
  if (tab.condition) exportQuery.set("condition", tab.condition);
  if (tab.archived) exportQuery.set("status", "archived");
  if (q) exportQuery.set("q", q);
  const exportHref = `${base}/export${exportQuery.size ? `?${exportQuery}` : ""}`;

  return (
    <>
      <PageHeader
        title="Equipment"
        description="All your vehicles and equipment"
        actions={
          <>
            {pendingReadings ? (
              <Button asChild variant="secondary" className="border-warn-line text-warn-ink">
                <Link href={`${base}/readings`}>
                  <Gauge /> Readings to approve ({pendingReadings})
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <a href={exportHref} download>
                <Download /> Export CSV
              </a>
            </Button>
            {manage ? (
              <>
                {can(ctx.capabilities, "assets.import_archive") ? (
                  <Button asChild variant="secondary">
                    <Link href={`${base}/import`}>
                      <Upload /> Import CSV
                    </Link>
                  </Button>
                ) : null}
                <Button asChild>
                  <Link href={`${base}/new`}>
                    <Plus /> Add equipment
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-stroke px-4 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter by condition" className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const n = t.key === "all" ? counts.total : t.condition ? counts[t.condition] : undefined;
              const active = t.key === tab.key;
              return (
                <Link
                  key={t.key}
                  href={href({ condition: t.condition, status: t.archived ? "archived" : undefined, q: q || undefined })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "border-b-2 px-2.5 pb-2.5 text-[13px] font-medium whitespace-nowrap",
                    active ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                  {n !== undefined ? <span className="ml-1 text-ink-subtle">({n})</span> : null}
                </Link>
              );
            })}
          </nav>
          <AutoFilterForm className="relative mb-3 w-full lg:w-80" role="search" action={base}>
            {tab.condition ? <input type="hidden" name="condition" value={tab.condition} /> : null}
            {tab.archived ? <input type="hidden" name="status" value="archived" /> : null}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search ID, make, model, rego or VIN" className={cn("h-9 pl-9 text-[13px]", SEARCH_FIELD)} aria-label="Search equipment" autoComplete="off" />
          </AutoFilterForm>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title={q ? "No equipment matches your search" : tab.key === "all" ? "Your equipment register is empty" : "Nothing here"}
            action={
              manage && !q && tab.key === "all" ? (
                <div className="flex gap-2">
                  <Button asChild>
                    <Link href={`${base}/new`}>
                      <Plus /> Add equipment
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={`${base}/import`}>
                      <Upload /> Import CSV
                    </Link>
                  </Button>
                </div>
              ) : null
            }
          >
            {tab.key === "all" && !q ? "Add vehicles, trailers, mobile plant and other equipment. The first five assets are free." : null}
          </EmptyState>
        ) : (
          <AssetTable rows={rows} base={base} operators={operators} />
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink-subtle">
          <span>{total === 0 ? "No results" : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, total)} of ${total} results`}</span>
          {pages > 1 ? (
            <div className="flex items-center gap-1">
              <Button asChild variant="secondary" size="sm" aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
                <Link href={href({ page: page - 1 })}>Previous</Link>
              </Button>
              <span className="px-2">
                Page {page} of {pages}
              </span>
              <Button asChild variant="secondary" size="sm" aria-disabled={page >= pages} className={cn(page >= pages && "pointer-events-none opacity-50")}>
                <Link href={href({ page: page + 1 })}>Next</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </>
  );
}
