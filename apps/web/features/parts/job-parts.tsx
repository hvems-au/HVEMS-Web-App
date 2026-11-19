import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { formatPartsRequestNumber, type CostLine, type PartsLine, type PartsRequest, type PartsUsage } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FitPartsDialog, ReturnFittedButton } from "./controls";
import { PartsStatusBadge, aud, qty } from "./status";

/**
 * Parts on a job: requests raised for it (and where they're up to), parts used
 * (fitted from deliveries or bought on the spot) with Return, and, for people
 * who see costs, what each posted.
 */
export function JobParts({
  orgId,
  workOrderId,
  assetId,
  requests,
  fittable,
  usage,
  costs,
  canRequest,
  canFit,
  returnTo,
}: {
  orgId: string;
  workOrderId: string;
  assetId: string;
  requests: PartsRequest[];
  fittable: (PartsLine & { request_number: number })[];
  usage: PartsUsage[];
  costs: CostLine[];
  canRequest: boolean;
  canFit: boolean;
  returnTo: string;
}) {
  const returned = new Set(usage.filter((u) => u.kind === "return").map((u) => u.reverses_id));
  const fits = usage.filter((u) => u.kind === "fit");
  const costOf = new Map(costs.map((c) => [c.source_id, c.amount_cents]));
  const total = costs.reduce((s, c) => s + Number(c.amount_cents), 0);
  return (
    <Card>
      <CardHeader
        title="Parts"
        description="Request parts for this job and record what you fit."
        action={
          canRequest ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customer/${orgId}/parts/new?asset=${assetId}&wo=${workOrderId}&return=${encodeURIComponent(returnTo)}`}>
                <PackageSearch /> Request parts
              </Link>
            </Button>
          ) : null
        }
      />
      <CardBody className="flex flex-col gap-4">
        {requests.length ? (
          <ul className="divide-y divide-stroke rounded-[10px] border border-stroke">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/customer/${orgId}/parts/${r.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-hover">
                  <span className="font-mono text-[13px] font-semibold text-ink">{formatPartsRequestNumber(r.number)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{r.urgency === "urgent" ? "Urgent" : ""}</span>
                  <PartsStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-muted">No parts requested for this job.</p>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-ink">Parts used</p>
            {canFit ? (
              <FitPartsDialog
                orgId={orgId}
                workOrderId={workOrderId}
                received={fittable.map((l) => ({
                  id: l.id,
                  label: `${l.description} · ${formatPartsRequestNumber(l.request_number)}`,
                  available: Number(l.received_qty) - Number(l.returned_to_supplier_qty) - Number(l.fitted_qty),
                  unit: l.unit,
                }))}
              />
            ) : null}
          </div>
          {fits.length === 0 ? (
            <p className="text-[13.5px] text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-stroke rounded-[10px] border border-stroke">
              {fits.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">
                      {qty(u.quantity)} {u.unit} · {u.description}
                    </span>
                    <span className="block text-[12.5px] text-ink-muted">
                      {u.line_id ? "From a parts request" : `Bought on the spot${u.supplier_name ? ` at ${u.supplier_name}` : ""}`}
                      {costOf.has(u.id) ? ` · ${aud(costOf.get(u.id))}` : ""}
                    </span>
                  </span>
                  {returned.has(u.id) ? <Badge tone="grey">Returned</Badge> : canFit ? <ReturnFittedButton orgId={orgId} usageId={u.id} label={u.description} /> : null}
                </li>
              ))}
            </ul>
          )}
          {costs.length ? (
            <p className="mt-2 text-right text-[13px] text-ink-muted">
              Parts cost on this job <span className="font-semibold text-ink">{aud(total)}</span>
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
