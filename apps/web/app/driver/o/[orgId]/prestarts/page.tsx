import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { INSPECTION_RESULT_LABELS, formatDateTimeAU, startOfDayInZone } from "@hvems/domain";
import { FilterBar } from "@/components/filter-bar";
import { ResultBadge } from "@/components/safety";
import { Card, EmptyState } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "My pre-starts" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 30;

/** The operator's own submitted pre-starts in this company, newest first. */
export default async function MyPrestarts({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/prestarts`);
  const result = firstParam(sp.result) ?? "";
  const from = ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "";
  const page = Math.max(Number(firstParam(sp.page) ?? 1) || 1, 1);
  const db = await createSupabaseServerClient();
  let q = db
    .from("inspections")
    .select("id, submitted_at, result, header", { count: "exact" })
    .eq("organisation_id", orgId)
    .eq("submitted_by", ctx.user.id);
  if (result in INSPECTION_RESULT_LABELS) q = q.eq("result", result);
  if (from) q = q.gte("submitted_at", startOfDayInZone(from, ctx.timezone).toISOString());
  const { data, count } = await q.order("submitted_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as { id: string; submitted_at: string; result: keyof typeof INSPECTION_RESULT_LABELS; header: { asset_number?: string; make?: string; model?: string } }[];
  const total = count ?? 0;
  const more = page * PAGE < total;
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (result) u.set("result", result);
    if (from) u.set("from", from);
    if (p > 1) u.set("page", String(p));
    return u.size ? `?${u}` : "";
  };

  return (
    <>
      <h1 className="mb-3 text-[22px] font-bold text-ink">My pre-starts</h1>
      <Card>
        <FilterBar
          action={`${base}/prestarts`}
          fields={[
            { kind: "select", name: "result", label: "Result", all: "Any result", value: result, options: Object.entries(INSPECTION_RESULT_LABELS).map(([value, label]) => ({ value, label })) },
            { kind: "date", name: "from", label: "From", value: from },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={result || from ? "No pre-starts match" : "No pre-starts yet"}>
            {result || from ? null : (
              <Link href={`${base}/equipment?for=prestart`} className="font-medium text-link hover:underline">
                Start a pre-start
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <p className="px-4 pt-3 text-[13px] text-ink-muted">{total} pre-start{total === 1 ? "" : "s"}</p>
            <ul className="divide-y divide-stroke">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`${base}/prestarts/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{p.header?.asset_number ?? "Equipment"}</span>
                      <span className="block truncate text-[13px] text-ink-muted">
                        {[p.header?.make, p.header?.model].filter(Boolean).join(" ")}
                        {p.header?.make || p.header?.model ? " · " : ""}
                        {formatDateTimeAU(new Date(p.submitted_at), ctx.timezone)}
                      </span>
                    </span>
                    <ResultBadge result={p.result} />
                    <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {page > 1 || more ? (
        <div className="mt-3 flex justify-between text-[14px]">
          {page > 1 ? (
            <Link href={`${base}/prestarts${qs(page - 1)}`} className="font-medium text-link hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {more ? (
            <Link href={`${base}/prestarts${qs(page + 1)}`} className="font-medium text-link hover:underline">
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
