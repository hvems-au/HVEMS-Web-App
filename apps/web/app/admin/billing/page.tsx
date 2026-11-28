import type { Metadata } from "next";
import Link from "next/link";
import { formatAud } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { AdjustmentList, billingStaff, secondApprovalThreshold, type AdjustmentRow } from "@/features/billing/admin-billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const TABS = [
  { key: "waiting", label: "Needs second approval" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
] as const;

/**
 * Console billing (SoW §5.8): refunds and credits waiting for a second approver, failed ones
 * to retry, and the full history. Refunds start from an organisation's Billing tab.
 */
export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === firstParam(sp.view))?.key ?? "waiting";
  const db = await createSupabaseServerClient();
  const [{ canApprove }, threshold, { data }] = await Promise.all([
    billingStaff(),
    secondApprovalThreshold(),
    db
      .from("billing_adjustments" as never)
      .select("*")
      .order("requested_at" as never, { ascending: false })
      .limit(200),
  ]);
  const all = (data ?? []) as unknown as AdjustmentRow[];
  const rows = tab === "waiting" ? all.filter((a) => a.status === "pending_approval") : tab === "failed" ? all.filter((a) => a.status === "failed") : all;
  const orgIds = [...new Set(rows.map((r) => r.organisation_id))];
  const { data: orgs } = orgIds.length ? await db.from("organisations").select("id, name").in("id", orgIds) : { data: [] };
  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const count = (k: (typeof TABS)[number]["key"]) => (k === "waiting" ? all.filter((a) => a.status === "pending_approval").length : k === "failed" ? all.filter((a) => a.status === "failed").length : all.length);

  return (
    <>
      <PageHeader
        title="Billing"
        description={`Refunds and credits over ${formatAud(threshold)} need a second billing approver. Start a refund or credit from an organisation's Billing tab.`}
      />
      {!canApprove ? (
        <p className="mb-5 text-[13.5px] text-ink-muted">You can see refunds and credits. Approving them needs the billing approver authority.</p>
      ) : null}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Adjustments">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/billing?view=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap", tab === t.key ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {t.label}
            {count(t.key) ? (
              <Badge tone={t.key === "waiting" ? "amber" : t.key === "failed" ? "red" : "grey"} className="ml-2">
                {count(t.key)}
              </Badge>
            ) : null}
          </Link>
        ))}
      </nav>
      <Card>
        <CardHeader title={TABS.find((t) => t.key === tab)!.label} />
        <AdjustmentList rows={rows} orgNames={orgNames} showOrg />
      </Card>
    </>
  );
}
