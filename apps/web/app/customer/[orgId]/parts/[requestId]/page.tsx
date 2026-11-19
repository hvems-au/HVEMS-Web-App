import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { formatPartsRequestNumber, getPartsRequest, getPersonNames, listSuppliers } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ReceiveDialog, RecordOrderDialog, RequestActions } from "@/features/parts/controls";
import { PARTS_STATUS, PartsStatusBadge, aud, qty } from "@/features/parts/status";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Parts request" };

const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** One parts request: what's needed, where it's up to, and the next step. */
export default async function PartsRequestPage({ params }: { params: Promise<{ orgId: string; requestId: string }> }) {
  const { orgId, requestId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const data = await getPartsRequest(db, orgId, requestId);
  if (!data) notFound();
  const { request: r, lines, prices, receipts } = data;
  const suppliers = await listSuppliers(db, orgId, true).catch(() => []);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const names = await getPersonNames(db, [...new Set([r.requested_by, r.decided_by, ...receipts.map((x) => x.recorded_by)].filter(Boolean) as string[])]);
  const who = (id: string | null) => (id ? (names.get(id) ?? "Former member") : "—");
  const manage = can(ctx.capabilities, "parts.manage");
  const seesCosts = can(ctx.capabilities, "assets.costs.view");
  const mine = r.requested_by === ctx.user.id;
  const label = formatPartsRequestNumber(r.number);
  const estimate = lines.reduce((s, l) => s + Math.round(Number(l.quantity) * Number(l.est_unit_cost_cents)), 0);
  const actual = lines.reduce((s, l) => s + Math.round(Number(l.quantity) * Number(prices.get(l.id)?.actual_unit_cost_cents ?? l.est_unit_cost_cents)), 0);
  const orderable = ["approved", "ordered", "partially_received"].includes(r.status);
  const receivable = ["ordered", "partially_received", "received"].includes(r.status);

  return (
    <>
      <PageHeader
        title={`${label} · ${r.asset?.asset_number ?? "Equipment"}`}
        description={`${[r.asset?.make, r.asset?.model].filter(Boolean).join(" ")}${r.urgency === "urgent" ? " · Urgent" : ""}`}
        breadcrumb={{ label: "Parts", href: `/customer/${orgId}/parts` }}
        actions={<PartsStatusBadge status={r.status} />}
      />

      {r.status === "submitted" && r.reapproval_reason ? (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[14px] text-warn-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Needs approval again.</span> {r.reapproval_reason}
          </span>
        </div>
      ) : null}
      {r.status === "rejected" && r.reject_reason ? (
        <div role="status" className="mb-5 rounded-[10px] border border-danger/40 bg-danger-soft px-4 py-3 text-[14px] text-danger-ink">
          <span className="font-semibold">Rejected by {who(r.decided_by)}:</span> {r.reject_reason}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Parts" description={PARTS_STATUS[r.status].help} />
          <Table>
            <THead>
              <tr>
                <TH>Part</TH>
                <TH>Qty</TH>
                <TH>Estimate</TH>
                {seesCosts ? <TH>Actual</TH> : null}
                <TH>Order</TH>
                <TH>Received</TH>
                <TH>Fitted</TH>
                {manage && (orderable || receivable) ? <TH className="text-right">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => {
                const net = Number(l.received_qty) - Number(l.returned_to_supplier_qty);
                const outstanding = Number(l.quantity) - net;
                const onHand = net - Number(l.fitted_qty);
                const price = prices.get(l.id);
                return (
                  <TR key={l.id}>
                    <TD className="max-w-[260px]">
                      <span className="font-medium text-ink">{l.description}</span>
                      <span className="block text-[12.5px] text-ink-muted">
                        {[l.part_number, l.specification, l.preferred_supplier_id ? `prefer ${supplierName.get(l.preferred_supplier_id) ?? "—"}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {qty(l.quantity)} {l.unit}
                    </TD>
                    <TD className="whitespace-nowrap">{aud(l.est_unit_cost_cents)} ea</TD>
                    {seesCosts ? <TD className="whitespace-nowrap">{price?.actual_unit_cost_cents != null ? `${aud(price.actual_unit_cost_cents)} ea` : "—"}</TD> : null}
                    <TD className="text-[13px]">
                      {l.ordered_on ? (
                        <>
                          {supplierName.get(l.supplier_id ?? "") ?? "—"} · {l.order_ref}
                          <span className="block text-ink-subtle">
                            {dmy(l.ordered_on)}
                            {l.expected_on ? ` → expected ${dmy(l.expected_on)}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-subtle">Not ordered</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {qty(net)} of {qty(l.quantity)}
                      {outstanding > 0 && net > 0 ? <span className="block text-[12px] text-warn-ink">{qty(outstanding)} to come</span> : null}
                    </TD>
                    <TD className="whitespace-nowrap">{qty(l.fitted_qty)}</TD>
                    {manage && (orderable || receivable) ? (
                      <TD>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {orderable && !l.cancelled_at ? (
                            <RecordOrderDialog
                              orgId={orgId}
                              lineId={l.id}
                              description={l.description}
                              suppliers={suppliers.filter((s) => !s.archived_at).map((s) => ({ value: s.id, label: s.name }))}
                              defaultSupplier={l.supplier_id ?? l.preferred_supplier_id}
                            />
                          ) : null}
                          {receivable && l.ordered_on && (outstanding > 0 || onHand > 0) ? (
                            <ReceiveDialog orgId={orgId} lineId={l.id} description={l.description} outstanding={outstanding} onHand={onHand} unit={l.unit} />
                          ) : null}
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <CardBody className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-stroke text-[14px]">
            <span className="text-ink-muted">
              Estimated total <span className="font-semibold text-ink">{aud(estimate)}</span>
            </span>
            {seesCosts && actual !== estimate ? (
              <span className="text-ink-muted">
                At actual prices <span className="font-semibold text-ink">{aud(actual)}</span>
              </span>
            ) : null}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-5 self-start">
          <Card>
            <CardHeader title="Next step" />
            <CardBody className="flex flex-col gap-3 text-[14px]">
              <RequestActions
                orgId={orgId}
                id={r.id}
                label={label}
                canSubmit={r.status === "draft" && (mine || manage)}
                canDecide={r.status === "submitted" && (can(ctx.capabilities, "parts.approve") || ctx.context.role === "owner")}
                canCancel={["draft", "submitted", "approved"].includes(r.status) && (mine || manage)}
              />
              {r.status === "submitted" ? <p className="text-[13px] text-ink-muted">Anyone whose Approval Limit covers the total can approve it; the database checks the limit.</p> : null}
              {r.status === "approved" || r.status === "ordered" ? (
                <p className="text-[13px] text-ink-muted">{manage ? "Record the order for each part, then each delivery as it arrives." : "A Fleet Manager records the order and deliveries."}</p>
              ) : null}
              {r.status === "received" || r.status === "partially_received" ? (
                <p className="text-[13px] text-ink-muted">Fit received parts on the job page (Record parts used).</p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-[14px]">
                <Item label="Work order">
                  {r.work_order_id && r.work_order ? (
                    <Link href={`/customer/${orgId}/my-work/${r.work_order_id}`} className="text-link hover:underline">
                      WO-{String(r.work_order.number).padStart(4, "0")} · {r.work_order.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Item>
                <Item label="Needed by">{dmy(r.needed_by)}</Item>
                <Item label="Deliver to">{r.site?.name ?? "—"}</Item>
                <Item label="Requested">
                  {who(r.requested_by)} · {formatDateTimeAU(new Date(r.created_at), ctx.timezone)}
                </Item>
                {r.decided_at ? (
                  <Item label={r.status === "rejected" ? "Rejected" : "Approved"}>
                    {r.auto_approved ? "Automatically (within the requester's limit)" : who(r.decided_by)} · {formatDateTimeAU(new Date(r.decided_at), ctx.timezone)}
                  </Item>
                ) : null}
                {r.notes ? <Item label="Notes">{r.notes}</Item> : null}
                {r.cancel_reason ? <Item label="Cancelled">{r.cancel_reason}</Item> : null}
              </dl>
            </CardBody>
          </Card>
          {receipts.length ? (
            <Card>
              <CardHeader title="Deliveries and returns" />
              <ul className="divide-y divide-stroke text-[13.5px]">
                {receipts.map((x) => {
                  const line = lines.find((l) => l.id === x.line_id);
                  return (
                    <li key={x.id} className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <Badge tone={x.kind === "receipt" ? "green" : "amber"}>{x.kind === "receipt" ? "Received" : "Returned"}</Badge>
                        {qty(x.quantity)} {line?.unit} · {line?.description}
                      </span>
                      <span className="block text-[12.5px] text-ink-muted">
                        {dmy(x.received_on)} · {who(x.recorded_by)}
                        {x.substitute_reason ? ` · substitute: ${x.substitute_reason}` : ""}
                        {x.return_reason ? ` · ${x.return_reason}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
