import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { IssueCategoryTag } from "@/features/operator/issue-category";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, ClipboardList, MessageSquareWarning, TriangleAlert } from "lucide-react";
import { formatDateTimeAU } from "@hvems/domain";
import { ResultBadge } from "@/components/safety";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { ISSUE_COLUMNS, issueProgress, type OperatorIssue } from "@/features/operator/issues";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Operator" };

/** Operator dashboard: the four things operators do, then their own recent activity. */
export default async function OperatorHome({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, base);
  const db = await createSupabaseServerClient();
  const [prestarts, issues] = await Promise.all([
    db
      .from("inspections")
      .select("id, submitted_at, result, header")
      .eq("organisation_id", orgId)
      .eq("submitted_by", ctx.user.id)
      .order("submitted_at", { ascending: false })
      .limit(5)
      .then((r) => (r.data ?? []) as { id: string; submitted_at: string; result: "pass" | "pass_with_faults" | "fail"; header: { asset_number?: string } }[]),
    db
      .from("defects")
      .select(ISSUE_COLUMNS)
      .eq("organisation_id", orgId)
      .eq("reported_by", ctx.user.id)
      .eq("source", "operator_report")
      .order("reported_at", { ascending: false })
      .limit(5)
      .then((r) => (r.data ?? []) as unknown as OperatorIssue[]),
  ]);
  const canPrestart = ctx.capabilities.has("inspections.submit");
  const canReport = ctx.capabilities.has("defects.report");
  const actions = [
    canPrestart && { href: `${base}/equipment?for=prestart`, label: "Start pre-start", help: "Check a vehicle or machine before you use it", Icon: ClipboardCheck, primary: true },
    canReport && { href: `${base}/equipment?for=issue`, label: "Report an issue", help: "Something wrong? Tell your managers", Icon: MessageSquareWarning, primary: false },
    { href: `${base}/prestarts`, label: "My pre-starts", help: "Pre-starts you've submitted", Icon: ClipboardList, primary: false },
    { href: `${base}/issues`, label: "My reported issues", help: "What you reported and where it's up to", Icon: TriangleAlert, primary: false },
  ].filter(Boolean) as { href: string; label: string; help: string; Icon: typeof ClipboardCheck; primary: boolean }[];

  return (
    <>
      <h1 className="sr-only">Operator home</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map(({ href, label, help, Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-4 rounded-[14px] px-5 py-4 shadow-card transition-all duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none",
              primary
                ? "bg-brand text-white hover:bg-brand-hover hover:shadow-[var(--elev-pop)] active:bg-brand-active"
                : "border border-stroke bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:shadow-[var(--elev-pop)]",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-[12px] transition-colors",
                primary ? "bg-white/15 text-white" : "bg-brand-soft text-brand-ink group-hover:bg-brand group-hover:text-white",
              )}
              aria-hidden
            >
              <Icon className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{label}</span>
              <span className={primary ? "block text-[13px] text-white/85" : "block text-[13px] text-ink-muted"}>{help}</span>
            </span>
            <ChevronRight className={cn("size-5 shrink-0 transition-transform group-hover:translate-x-0.5", primary ? "opacity-80" : "text-ink-subtle group-hover:text-brand-ink")} aria-hidden />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent pre-starts"
            action={
              <Link href={`${base}/prestarts`} className="text-[13px] font-medium text-link hover:underline">
                All
              </Link>
            }
          />
          {prestarts.length === 0 ? (
            <p className="px-5 pt-1 pb-5 text-[14px] text-ink-muted">You haven&apos;t submitted a pre-start here yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stroke">
              {prestarts.map((p) => (
                <li key={p.id}>
                  <Link href={`${base}/prestarts/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{p.header?.asset_number ?? "Equipment"}</span>
                      <span className="block text-[13px] text-ink-muted">{formatDateTimeAU(new Date(p.submitted_at), ctx.timezone)}</span>
                    </span>
                    <ResultBadge result={p.result} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Recent reported issues"
            action={
              <Link href={`${base}/issues`} className="text-[13px] font-medium text-link hover:underline">
                All
              </Link>
            }
          />
          {issues.length === 0 ? (
            <p className="px-5 pt-1 pb-5 text-[14px] text-ink-muted">You haven&apos;t reported an issue here yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stroke">
              {issues.map((d) => {
                const p = issueProgress(d);
                return (
                  <li key={d.id}>
                    <Link href={`${base}/issues/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{d.title}</span>
                        <span className="block text-[13px] text-ink-muted">
                          <IssueCategoryTag value={d.issue_category} source={d.source} className="mr-1.5 text-[13px]" />
                        {d.asset?.asset_number ?? "Equipment"} · {formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}
                        </span>
                      </span>
                      <Badge tone={p.tone}>{p.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
