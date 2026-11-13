import Link from "next/link";
import { History } from "lucide-react";
import { formatWorkOrderNumber, type ServiceDueChange, type ServiceScheduleRow, type WorkOrder } from "@hvems/api-client";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { WorkOrderStatusBadge } from "./badges";
import { AddServicePlanDialog, NewWorkOrderDialog, RemovePlanButton } from "./controls";

type Opt = { value: string; label: string };
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const n = (v: number | null) => (v === null ? "" : Number(v).toLocaleString("en-AU", { maximumFractionDigits: 1 }));
const STATUS = { overdue: { tone: "red", text: "Overdue" }, due_soon: { tone: "amber", text: "Due soon" }, ok: { tone: "green", text: "OK" } } as const;

function every(r: ServiceScheduleRow) {
  return [r.interval_days && `${r.interval_days} days`, r.interval_km && `${n(r.interval_km)} km`, r.interval_hours && `${n(r.interval_hours)} h`].filter(Boolean).join(" / ");
}
function due(on: string | null, km: number | null, hours: number | null) {
  return [on && dmy(on), km !== null && `${n(km)} km`, hours !== null && `${n(hours)} h`].filter(Boolean).join(" · ") || "—";
}

/**
 * The equipment's own maintenance: its service plans (next due, last done, what
 * was chosen before) and its recent work orders. Managers add and remove plans
 * and raise work orders here; everyone else who works on jobs sees it read-only.
 */
export function EquipmentMaintenance({
  orgId,
  assetId,
  plans,
  history,
  workOrders,
  manage,
  equipment,
  people,
  names,
  jobBase,
}: {
  orgId: string;
  assetId: string;
  plans: ServiceScheduleRow[];
  history: Map<string, ServiceDueChange[]>;
  workOrders: WorkOrder[];
  manage: boolean;
  equipment: Opt[];
  people: Opt[];
  names: Map<string, string>;
  /** Where a work order opens: the job view for technicians, Work Orders for managers. */
  jobBase: string;
}) {
  return (
    <Card id="maintenance" className="mt-5 scroll-mt-20">
      <CardHeader
        title="Maintenance"
        description="Service plans for this equipment and its recent work orders."
        action={manage ? <AddServicePlanDialog orgId={orgId} equipment={equipment} assetId={assetId} /> : null}
      />
      <CardBody className="flex flex-col gap-5">
        {plans.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-stroke-strong px-4 py-5 text-center text-[13.5px] text-ink-muted">
            No service plans yet{manage ? ". Add one for each regular service, e.g. a 250-hour service or an annual inspection." : "."}
          </p>
        ) : (
          <ul className="divide-y divide-stroke rounded-[12px] border border-stroke">
            {plans.map((p) => {
              const h = history.get(p.id) ?? [];
              return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                        {p.name}
                        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].text}</Badge>
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-muted">Every {every(p)}</p>
                    </div>
                    {manage ? (
                      <div className="flex flex-wrap gap-1.5">
                        <NewWorkOrderDialog
                          orgId={orgId}
                          equipment={equipment}
                          people={people}
                          preset={{ asset_id: assetId, title: p.name, service_plan_id: p.id }}
                          label="Work order"
                          variant="secondary"
                        />
                        <RemovePlanButton orgId={orgId} id={p.id} name={p.name} />
                      </div>
                    ) : null}
                  </div>
                  <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-subtle">Next due</dt>
                      <dd className="font-medium text-ink">
                        {due(p.next_due_on, p.next_due_km, p.next_due_hours)}
                        {p.next_due_chosen ? <span className="ml-1 font-normal text-ink-muted">(chosen at the last service)</span> : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-subtle">Last done</dt>
                      <dd className="text-ink">{due(p.last_done_on, p.last_done_km, p.last_done_hours)}</dd>
                    </div>
                  </dl>
                  {h.length ? (
                    <details className="text-[13px]">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-link [&::-webkit-details-marker]:hidden">
                        <History className="size-4" aria-hidden /> Next due chosen before ({h.length})
                      </summary>
                      <ul className="mt-2 divide-y divide-stroke rounded-[8px] border border-stroke">
                        {h.map((x) => (
                          <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                            <span className="font-medium text-ink">{due(x.next_due_on, x.next_due_km, x.next_due_hours)}</span>
                            <span className="text-ink-subtle">
                              {(x.set_by && names.get(x.set_by)) || "—"} · {dmy(x.set_at.slice(0, 10))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">Recent work orders</p>
          {workOrders.length === 0 ? (
            <p className="text-[13.5px] text-ink-muted">No work orders yet.</p>
          ) : (
            <ul className="divide-y divide-stroke rounded-[12px] border border-stroke">
              {workOrders.map((w) => (
                <li key={w.id}>
                  <Link href={`${jobBase}/${w.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{w.title}</span>
                      <span className="block text-[12.5px] text-ink-muted">
                        {formatWorkOrderNumber(w.number)}
                        {w.completed_at ? ` · done ${dmy(w.completed_at.slice(0, 10))}` : w.due_on ? ` · due ${dmy(w.due_on)}` : ""}
                        {w.assigned_to ? ` · ${names.get(w.assigned_to) ?? "Former member"}` : ""}
                      </span>
                    </span>
                    <WorkOrderStatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
