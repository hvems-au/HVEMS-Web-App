import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listServiceSchedule, type ServiceScheduleRow } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { AddServicePlanDialog, NewWorkOrderDialog, RemovePlanButton } from "@/features/maintenance/controls";
import { maintenanceOptions } from "@/features/maintenance/options";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Maintenance" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const n = (v: number | null) => (v === null ? "" : Number(v).toLocaleString("en-AU", { maximumFractionDigits: 1 }));
const STATUS = { overdue: { tone: "red", text: "Overdue" }, due_soon: { tone: "amber", text: "Due soon" }, ok: { tone: "green", text: "OK" } } as const;

function every(r: ServiceScheduleRow) {
  return [r.interval_days && `${r.interval_days} days`, r.interval_km && `${n(r.interval_km)} km`, r.interval_hours && `${n(r.interval_hours)} h`].filter(Boolean).join(" / ");
}
function nextDue(r: ServiceScheduleRow) {
  const parts: string[] = [];
  if (r.next_due_on) parts.push(dmy(r.next_due_on));
  if (r.next_due_km !== null) parts.push(`${n(r.next_due_km)} km${r.current_km !== null ? ` (now ${n(r.current_km)})` : ""}`);
  if (r.next_due_hours !== null) parts.push(`${n(r.next_due_hours)} h${r.current_hours !== null ? ` (now ${n(r.current_hours)})` : ""}`);
  return parts.join(" · ");
}

/** Service plans and the maintenance schedule (CS-17). */
export default async function MaintenancePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const manager = can(ctx.capabilities, "work_orders.manage");
  if (!manager && !can(ctx.capabilities, "work_orders.work")) notFound();
  const db = await createSupabaseServerClient();
  const [rows, opts] = await Promise.all([listServiceSchedule(db, orgId), manager ? maintenanceOptions(db, orgId) : Promise.resolve(null)]);
  const counts = { overdue: rows.filter((r) => r.status === "overdue").length, due_soon: rows.filter((r) => r.status === "due_soon").length };

  return (
    <>
      <PageHeader
        title="Maintenance"
        description={`Service plans by date, kilometres or hours. ${counts.overdue} overdue, ${counts.due_soon} due soon.`}
        actions={opts ? <AddServicePlanDialog orgId={orgId} equipment={opts.equipment} /> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No service plans yet">Add a plan for each regular service, for example a 250-hour service or an annual inspection.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Equipment</TH>
                <TH>Service</TH>
                <TH>Every</TH>
                <TH>Last done</TH>
                <TH>Next due</TH>
                <TH>Status</TH>
                {opts ? <TH className="text-right">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/customer/${orgId}/equipment/${r.asset_id}`} className="font-semibold text-link hover:underline">
                      {r.asset?.asset_number}
                    </Link>
                  </TD>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-ink-muted">{every(r)}</TD>
                  <TD className="text-ink-muted">
                    {[r.last_done_on && dmy(r.last_done_on), r.last_done_km !== null && `${n(r.last_done_km)} km`, r.last_done_hours !== null && `${n(r.last_done_hours)} h`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TD>
                  <TD>{nextDue(r)}</TD>
                  <TD>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
                  </TD>
                  {opts ? (
                    <TD>
                      <div className="flex justify-end gap-1">
                        <NewWorkOrderDialog
                          orgId={orgId}
                          equipment={opts.equipment}
                          people={opts.people}
                          preset={{ asset_id: r.asset_id, title: r.name, service_plan_id: r.id }}
                          label="Work order"
                          variant="secondary"
                        />
                        <RemovePlanButton orgId={orgId} id={r.id} name={r.name} />
                      </div>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
