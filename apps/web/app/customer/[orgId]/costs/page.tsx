import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listClients, listExpenditure, type ExpenditureLine } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { aud } from "@/features/parts/status";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Costs" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: Record<ExpenditureLine["kind"], string> = { parts: "Parts", labour: "Labour", external: "Outside work", fuel: "Fuel", other: "Other" };
const wo = (n: number) => `WO-${String(n).padStart(4, "0")}`;

function Totals({ title, rows }: { title: string; rows: { key: string; label: React.ReactNode; cents: number }[] }) {
  const top = rows.sort((a, b) => b.cents - a.cents).slice(0, 8);
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="pt-0">
        {top.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nothing in this period.</p>
        ) : (
          <ul className="divide-y divide-stroke">
            {top.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className={cn("shrink-0 font-semibold", r.cents < 0 && "text-danger-ink")}>{aud(r.cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function group<T>(lines: ExpenditureLine[], key: (l: ExpenditureLine) => string | null, label: (l: ExpenditureLine) => T) {
  const m = new Map<string, { key: string; label: T; cents: number }>();
  for (const l of lines) {
    const k = key(l);
    if (!k) continue;
    const cur = m.get(k) ?? { key: k, label: label(l), cents: 0 };
    cur.cents += l.amount_cents;
    m.set(k, cur);
  }
  return [...m.values()].filter((r) => r.cents !== 0);
}

/** Expenditure (CS-23, EXP-01/03): every cost line, with totals by type, equipment, work order and client. */
export default async function CostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "assets.costs.view")) notFound();
  const db = await createSupabaseServerClient();
  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60),
    kind: firstParam(sp.kind) ?? "",
    asset: firstParam(sp.asset) ?? "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
  };
  const [all, clients] = await Promise.all([listExpenditure(db, orgId), listClients(db, orgId)]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const lines = all.filter((l) => {
    const day = new Date(l.created_at).toLocaleDateString("en-CA", { timeZone: ctx.timezone });
    return (
      (!f.q || [l.description, l.asset?.asset_number, l.work_order?.title, l.work_order ? wo(l.work_order.number) : null].some((x) => (x ?? "").toLowerCase().includes(f.q))) &&
      (!f.kind || l.kind === f.kind) &&
      (!f.asset || l.asset_id === f.asset) &&
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to)
    );
  });
  const total = lines.reduce((s, l) => s + l.amount_cents, 0);
  const byKind = group(lines, (l) => l.kind, (l) => KINDS[l.kind]);
  const byAsset = group(
    lines,
    (l) => l.asset_id,
    (l) => (
      <Link href={`/customer/${orgId}/equipment/${l.asset_id}`} className="font-medium text-link hover:underline">
        {l.asset?.asset_number ?? "—"}
      </Link>
    ),
  );
  const byWo = group(
    lines,
    (l) => l.work_order_id,
    (l) => (
      <Link href={`/customer/${orgId}/work-orders/${l.work_order_id}`} className="text-link hover:underline">
        {l.work_order ? `${wo(l.work_order.number)} · ${l.work_order.title}` : "—"}
      </Link>
    ),
  );
  const byClient = group(lines, (l) => l.asset?.client_id ?? null, (l) => clientName.get(l.asset?.client_id ?? "") ?? "Former client");
  const equipment = [...new Map(all.filter((l) => l.asset_id).map((l) => [l.asset_id!, l.asset?.asset_number ?? "—"])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader
        title="Costs"
        description="Parts fitted, labour and outside work on closed work orders, and fuel. Each cost is posted once; corrections and reopened jobs post reversing lines."
      />
      <Card className="mb-4">
        <FilterBar
          action={`/customer/${orgId}/costs`}
          search={{ value: f.q, placeholder: "Description, equipment or work order" }}
          fields={[
            { kind: "select", name: "kind", label: "Type", all: "Any type", value: f.kind, options: Object.entries(KINDS).map(([value, label]) => ({ value, label })) },
            { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipment },
            { kind: "date", name: "from", label: "From", value: f.from },
            { kind: "date", name: "to", label: "To", value: f.to },
          ]}
        />
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-stroke px-5 py-3">
          <span className="text-[13px] text-ink-muted">Total for this selection</span>
          <span className="text-[22px] font-semibold text-ink">{aud(total)}</span>
          <span className="text-[12.5px] text-ink-subtle">Amounts as entered (GST included unless marked otherwise)</span>
        </div>
      </Card>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Totals title="By type" rows={byKind} />
        <Totals title="By equipment" rows={byAsset} />
        <Totals title="By work order" rows={byWo} />
        <Totals title="By client" rows={byClient} />
      </div>
      <Card>
        <CardHeader title="Cost lines" />
        {lines.length === 0 ? (
          <EmptyState title={all.length ? "No costs match" : "No costs yet"}>
            {all.length ? "Try a different search or filter." : "Costs appear when parts are fitted, work orders are closed or fuel is recorded with a cost."}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Posted</TH>
                <TH>Type</TH>
                <TH>Description</TH>
                <TH>Equipment</TH>
                <TH>Work order</TH>
                <TH className="text-right">Amount</TH>
              </tr>
            </THead>
            <tbody>
              {lines.slice(0, 500).map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(l.created_at), ctx.timezone)}</TD>
                  <TD>{KINDS[l.kind]}</TD>
                  <TD className="max-w-[320px]">
                    <span className="block truncate">{l.description}</span>
                    {!l.gst_included ? <span className="text-[12px] text-ink-subtle">Excludes GST</span> : null}
                  </TD>
                  <TD>{l.asset?.asset_number ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{l.work_order ? wo(l.work_order.number) : "—"}</TD>
                  <TD className={cn("text-right font-medium whitespace-nowrap", l.amount_cents < 0 && "text-danger-ink")}>{aud(l.amount_cents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {lines.length > 500 ? <p className="px-5 py-3 text-[12.5px] text-ink-muted">Showing the latest 500 of {lines.length}. Narrow the dates to see more.</p> : null}
      </Card>
    </>
  );
}
