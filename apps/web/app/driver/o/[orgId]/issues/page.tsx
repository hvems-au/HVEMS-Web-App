import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDateTimeAU } from "@hvems/domain";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { ISSUE_COLUMNS, issueProgress, type OperatorIssue } from "@/features/operator/issues";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "My reported issues" };

/** Issues the operator reported in this company and where each one is up to. */
export default async function MyIssues({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/issues`);
  const state = firstParam(sp.state) === "closed" ? "closed" : firstParam(sp.state) === "open" ? "open" : "";
  const db = await createSupabaseServerClient();
  let q = db.from("defects").select(ISSUE_COLUMNS).eq("organisation_id", orgId).eq("reported_by", ctx.user.id).eq("source", "operator_report");
  if (state === "open") q = q.eq("status", "open");
  if (state === "closed") q = q.neq("status", "open");
  const { data } = await q.order("reported_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as OperatorIssue[];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold text-ink">My reported issues</h1>
        {ctx.capabilities.has("defects.report") ? (
          <Link href={`${base}/equipment?for=issue`} className="text-[14px] font-medium text-link hover:underline">
            Report an issue
          </Link>
        ) : null}
      </div>
      <Card>
        <FilterBar
          action={`${base}/issues`}
          fields={[
            {
              kind: "select",
              name: "state",
              label: "Show",
              all: "All",
              value: state,
              options: [
                { value: "open", label: "Still open" },
                { value: "closed", label: "Finished" },
              ],
            },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={state ? "Nothing here" : "You haven't reported any issues"}>
            {state ? null : "Something wrong with a vehicle or machine? Report it from the equipment screen."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-stroke">
            {rows.map((d) => {
              const p = issueProgress(d);
              return (
                <li key={d.id}>
                  <Link href={`${base}/issues/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{d.title}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {d.asset?.asset_number ?? "Equipment"} · {formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}
                      </span>
                    </span>
                    <Badge tone={p.tone}>{p.label}</Badge>
                    <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
