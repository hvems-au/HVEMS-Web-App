import "server-only";
import { formatAud } from "@hvems/domain";
import { CircleDollarSign, Receipt, Undo2 } from "lucide-react";
import { StatCard } from "@/components/shell/page";
import { Card, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Rolling 12-month revenue for the console (Figma console; SoW §5). Money in: monthly
 * subscription invoices when paid, and connection fees when collected. Money back:
 * refunds when completed. Credits are shown separately (they reduce a later invoice,
 * which is already counted net when paid). Brisbane months; amounts include GST if any.
 */
type Month = { key: string; subscriptions: number; fees: number; refunds: number; credits: number };

const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" }).slice(0, 7);
const LABEL = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });

export async function RevenueSection() {
  const db = await createSupabaseServerClient();
  // This month in Brisbane, and the 11 before it.
  const [cy, cm] = monthKey(new Date().toISOString()).split("-").map(Number) as [number, number];
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) keys.push(new Date(Date.UTC(cy, cm - 1 - i, 15)).toISOString().slice(0, 7));
  const since = new Date(Date.UTC(cy, cm - 13, 1)).toISOString();

  const [{ data: invoices }, { data: engagements }, { data: adjustments }] = await Promise.all([
    db.from("billing_invoices" as never).select("amount_cents, paid_at").eq("status" as never, "paid" as never).gte("paid_at" as never, since as never).limit(10000),
    db.from("marketplace_engagements").select("poster_fee_cents, provider_fee_cents, accepted_at").in("fee_status", ["collected", "refunded"]).gte("accepted_at", since).limit(10000),
    db
      .from("billing_adjustments" as never)
      .select("kind, amount_cents, completed_at")
      .eq("status" as never, "completed" as never)
      .in("kind" as never, ["refund", "credit"] as never)
      .gte("completed_at" as never, since as never)
      .limit(10000),
  ]);

  const months = new Map<string, Month>(keys.map((k) => [k, { key: k, subscriptions: 0, fees: 0, refunds: 0, credits: 0 }]));
  for (const i of (invoices ?? []) as unknown as { amount_cents: number; paid_at: string }[]) {
    const m = months.get(monthKey(i.paid_at));
    if (m) m.subscriptions += i.amount_cents;
  }
  for (const e of engagements ?? []) {
    const m = months.get(monthKey(e.accepted_at));
    if (m) m.fees += e.poster_fee_cents + e.provider_fee_cents;
  }
  for (const a of (adjustments ?? []) as unknown as { kind: string; amount_cents: number; completed_at: string }[]) {
    const m = months.get(monthKey(a.completed_at));
    if (!m) continue;
    if (a.kind === "refund") m.refunds += a.amount_cents;
    else m.credits += a.amount_cents;
  }
  const list = [...months.values()];
  const net = (m: Month) => m.subscriptions + m.fees - m.refunds;
  const total = list.reduce((s, m) => s + net(m), 0);
  const current = list[list.length - 1]!;
  const refunds12 = list.reduce((s, m) => s + m.refunds, 0);
  const any = list.some((m) => m.subscriptions || m.fees || m.refunds || m.credits);

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue, last 12 months" value={formatAud(total)} sub="Subscriptions and connection fees, less refunds" icon={<CircleDollarSign />} />
        <StatCard
          label="This month so far"
          value={formatAud(net(current))}
          sub={`${formatAud(current.subscriptions)} subscriptions · ${formatAud(current.fees)} fees`}
          icon={<Receipt />}
          href="/admin/billing?view=all"
        />
        <StatCard label="Refunds, last 12 months" value={formatAud(refunds12)} icon={<Undo2 />} href="/admin/billing?view=all" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Revenue by month" description="Subscriptions count when paid, connection fees when collected, refunds when made. Brisbane time; amounts include GST if any." />
        {!any ? (
          <EmptyState title="No revenue yet">Invoicing and connection fees are switched on in Settings once approved.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Month</TH>
                <TH className="text-right">Subscriptions</TH>
                <TH className="text-right">Connection fees</TH>
                <TH className="text-right">Refunds</TH>
                <TH className="text-right">Net</TH>
                <TH className="text-right">Credits given</TH>
              </tr>
            </THead>
            <tbody>
              {[...list].reverse().map((m) => (
                <TR key={m.key}>
                  <TD className="font-medium">{LABEL.format(new Date(`${m.key}-15T00:00:00Z`))}</TD>
                  <TD className="text-right">{formatAud(m.subscriptions)}</TD>
                  <TD className="text-right">{formatAud(m.fees)}</TD>
                  <TD className="text-right">{m.refunds ? `−${formatAud(m.refunds)}` : formatAud(0)}</TD>
                  <TD className="text-right font-semibold">{formatAud(net(m))}</TD>
                  <TD className="text-right text-ink-muted">{formatAud(m.credits)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
