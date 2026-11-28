import "server-only";
import Link from "next/link";
import { getPersonNames } from "@hvems/api-client";
import { formatDateAU, formatDateTimeAU, formatAud } from "@hvems/domain";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { getSessionUser, getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdjustmentButton, DecideAdjustment, RetryAdjustment } from "./admin-controls";

export interface AdjustmentRow {
  id: string;
  number: number;
  organisation_id: string;
  kind: "refund" | "credit" | "waiver_restore";
  amount_cents: number;
  quantity: number;
  reason: string;
  invoice_id: string | null;
  engagement_id: string | null;
  fee_side: "poster" | "provider" | null;
  status: "pending_approval" | "approved" | "processing" | "completed" | "rejected" | "failed";
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  decision_note: string | null;
  last_error: string | null;
}

const STATUS: Record<AdjustmentRow["status"], { label: string; tone: "green" | "amber" | "red" | "grey" }> = {
  pending_approval: { label: "Needs second approval", tone: "amber" },
  approved: { label: "Approved", tone: "grey" },
  processing: { label: "Processing", tone: "grey" },
  completed: { label: "Done", tone: "green" },
  rejected: { label: "Rejected", tone: "grey" },
  failed: { label: "Failed", tone: "red" },
};
const MONTH = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

export async function billingStaff() {
  const [staff, user] = await Promise.all([getStaffContext(), getSessionUser()]);
  const canApprove = !!staff && (staff.role === "platform_administrator" || (staff.authorities ?? []).includes("billing_approver"));
  return { canApprove, userId: user?.id ?? null };
}

export async function secondApprovalThreshold(): Promise<number> {
  const db = await createSupabaseServerClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "billing.second_approval_threshold_cents").maybeSingle();
  const v = Number(data?.value);
  return Number.isFinite(v) ? v : 50000;
}

function describe(a: AdjustmentRow): string {
  if (a.kind === "waiver_restore") return `${a.quantity} waiver${a.quantity === 1 ? "" : "s"} restored`;
  if (a.kind === "credit") return `Credit ${formatAud(a.amount_cents)}`;
  return `Refund ${formatAud(a.amount_cents)} ${a.invoice_id ? "of an invoice" : `of the ${a.fee_side === "poster" ? "customer's" : "provider's"} connection fee`}`;
}

/** A list of adjustments with approve, reject and retry where they apply. */
export async function AdjustmentList({ rows, orgNames, showOrg }: { rows: AdjustmentRow[]; orgNames?: Map<string, string>; showOrg?: boolean }) {
  const db = await createSupabaseServerClient();
  const { canApprove, userId } = await billingStaff();
  const names = await getPersonNames(db, [...new Set(rows.flatMap((r) => [r.requested_by, r.approved_by].filter(Boolean) as string[]))]).catch(
    () => new Map<string, string>(),
  );
  const nameOf = (id: string | null) => (id ? ((names as Map<string, string>).get(id) ?? "HVEMS staff") : "");
  if (!rows.length) return <EmptyState title="Nothing here" />;
  return (
    <ul className="divide-y divide-stroke">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-[14px]">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
              {describe(a)}
              <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
            </p>
            {showOrg ? (
              <Link href={`/admin/organisations/${a.organisation_id}?tab=billing`} className="text-[13px] font-medium text-link hover:underline">
                {orgNames?.get(a.organisation_id) ?? "Organisation"}
              </Link>
            ) : null}
            <p className="mt-0.5 text-[13px] text-ink-muted">{a.reason}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              No. {a.number} · asked by {nameOf(a.requested_by)} {formatDateTimeAU(new Date(a.requested_at))}
              {a.approved_by ? ` · approved by ${nameOf(a.approved_by)}` : ""}
              {a.decision_note ? ` · ${a.decision_note}` : ""}
            </p>
            {a.status === "failed" && a.last_error ? <p className="mt-0.5 text-[12.5px] text-danger">{a.last_error}</p> : null}
          </div>
          {canApprove && a.status === "pending_approval" ? <DecideAdjustment id={a.id} mine={a.requested_by === userId} /> : null}
          {canApprove && a.status === "failed" ? <RetryAdjustment id={a.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Billing tab on a console organisation: invoices, connection fees and adjustments, with refunds and credits. */
export async function OrgBillingPanel({ orgId, orgKind }: { orgId: string; orgKind: string }) {
  const db = await createSupabaseServerClient();
  const [{ canApprove }, threshold] = await Promise.all([billingStaff(), secondApprovalThreshold()]);
  const [{ data: invoiceRows }, { data: engagementRows }, { data: adjustmentRows }] = await Promise.all([
    db
      .from("billing_invoices" as never)
      .select("id, period_start, description, amount_cents, status, number, paid_at")
      .eq("organisation_id" as never, orgId as never)
      .order("period_start" as never, { ascending: false })
      .limit(24),
    db
      .from("marketplace_engagements")
      .select("id, number, organisation_id, provider_id, poster_fee_cents, provider_fee_cents, fee_status, accepted_at")
      .or(`organisation_id.eq.${orgId},provider_id.eq.${orgId}`)
      .in("fee_status", ["collected", "refunded"])
      .order("accepted_at", { ascending: false })
      .limit(50),
    db
      .from("billing_adjustments" as never)
      .select("*")
      .eq("organisation_id" as never, orgId as never)
      .order("requested_at" as never, { ascending: false })
      .limit(50),
  ]);
  const invoices = (invoiceRows ?? []) as unknown as { id: string; period_start: string; description: string; amount_cents: number; status: string; number: string | null }[];
  const adjustments = (adjustmentRows ?? []) as unknown as AdjustmentRow[];
  const refunded = (pick: (a: AdjustmentRow) => boolean) =>
    adjustments.filter((a) => a.kind === "refund" && !["rejected", "failed"].includes(a.status) && pick(a)).reduce((s, a) => s + a.amount_cents, 0);
  const fees = (engagementRows ?? []).flatMap((e) => {
    const side: "poster" | "provider" = e.organisation_id === orgId ? "poster" : "provider";
    const paid = side === "poster" ? e.poster_fee_cents : e.provider_fee_cents;
    return paid > 0 ? [{ ...e, side, paid, left: paid - refunded((a) => a.engagement_id === e.id && a.fee_side === side) }] : [];
  });

  return (
    <div className="flex flex-col gap-5">
      {canApprove ? (
        <div className="flex flex-wrap gap-2">
          <AdjustmentButton kind="credit" organisationId={orgId} thresholdCents={threshold} />
          {orgKind === "company" ? <AdjustmentButton kind="waiver_restore" organisationId={orgId} thresholdCents={threshold} /> : null}
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-muted">Refunds and credits need the billing approver authority.</p>
      )}

      <Card>
        <CardHeader title="Invoices" description="Monthly fleet and provider subscriptions." />
        {invoices.length ? (
          <ul className="divide-y divide-stroke">
            {invoices.map((i) => {
              const left = i.amount_cents - refunded((a) => a.invoice_id === i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14px]">
                  <span className="min-w-36 font-medium">{MONTH.format(new Date(i.period_start))}</span>
                  <span className="flex-1 text-ink-muted">{i.description}</span>
                  <span className="font-medium">{formatAud(i.amount_cents)}</span>
                  <Badge tone={i.status === "paid" ? "green" : i.status === "failed" ? "red" : "grey"}>{i.status}</Badge>
                  {left < i.amount_cents ? <span className="text-[12.5px] text-ink-subtle">{formatAud(i.amount_cents - left)} refunded</span> : null}
                  {canApprove && i.status === "paid" && left > 0 ? (
                    <AdjustmentButton kind="refund" organisationId={orgId} maxCents={left} label={`${MONTH.format(new Date(i.period_start))} invoice`} invoiceId={i.id} thresholdCents={threshold} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No invoices" />
        )}
      </Card>

      <Card>
        <CardHeader title="Connection fees paid" description="Fees this organisation paid on accepted marketplace jobs." />
        {fees.length ? (
          <ul className="divide-y divide-stroke">
            {fees.map((f) => (
              <li key={`${f.id}-${f.side}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14px]">
                <span className="min-w-36 font-medium">Engagement {f.number}</span>
                <span className="flex-1 text-ink-muted">
                  {f.side === "poster" ? "As the customer" : "As the provider"} · {formatDateAU(new Date(f.accepted_at))}
                </span>
                <span className="font-medium">{formatAud(f.paid)}</span>
                {f.left < f.paid ? <span className="text-[12.5px] text-ink-subtle">{formatAud(f.paid - f.left)} refunded</span> : null}
                {canApprove && f.left > 0 ? (
                  <AdjustmentButton
                    kind="refund"
                    organisationId={orgId}
                    maxCents={f.left}
                    label={`engagement ${f.number} connection fee`}
                    engagementId={f.id}
                    feeSide={f.side}
                    thresholdCents={threshold}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No connection fees paid" />
        )}
      </Card>

      <Card>
        <CardHeader title="Refunds, credits and waivers" />
        <AdjustmentList rows={adjustments} />
      </Card>
    </div>
  );
}
