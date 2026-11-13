import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWorkOrderNumber, getWorkOrder } from "@hvems/api-client";
import { QUALIFICATION_LABELS, formatAud, formatDateTimeAU } from "@hvems/domain";
import { AlertTriangle } from "lucide-react";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { PriorityBadge, WorkOrderStatusBadge } from "@/features/maintenance/badges";
import { WorkOrderActions } from "@/features/maintenance/controls";
import { maintenanceOptions } from "@/features/maintenance/options";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Work order" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-b border-stroke py-2.5 text-[14px] last:border-0">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}

/** One work order with its history and the actions the person may take (CS-18). */
export default async function WorkOrderPage({ params }: { params: Promise<{ orgId: string; woId: string }> }) {
  const { orgId, woId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const manager = can(ctx.capabilities, "work_orders.manage");
  if (!manager && !can(ctx.capabilities, "work_orders.work")) notFound();
  const db = await createSupabaseServerClient();
  const [w, opts] = await Promise.all([getWorkOrder(db, orgId, woId), maintenanceOptions(db, orgId)]);
  if (!w) notFound();
  const asset = await db.from("assets").select("meter_type").eq("id", w.asset_id).maybeSingle();
  const tz = ctx.timezone;
  const who = (id: string | null) => (id ? (opts.nameOf.get(id) ?? "Former member") : null);
  const when = (iso: string | null) => (iso ? formatDateTimeAU(new Date(iso), tz) : null);
  const mt = asset.data?.meter_type ?? "none";

  return (
    <>
      <PageHeader
        title={`${formatWorkOrderNumber(w.number)} · ${w.title}`}
        description={`${w.asset?.asset_number ?? ""} ${[w.asset?.make, w.asset?.model].filter(Boolean).join(" ")}`}
        breadcrumb={{ label: "Work Orders", href: `/customer/${orgId}/work-orders` }}
        actions={<WorkOrderStatusBadge status={w.status} />}
      />
      {w.assignment_warnings?.length && !["closed", "cancelled"].includes(w.status) ? (
        <div role="status" className="mb-5 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13.5px] text-warn-ink">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> Allocation warning for {who(w.assigned_to) ?? "the assignee"}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {w.assignment_warnings.map((x) => (
              <li key={x.code}>{x.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl>
              <Row
                label="Equipment"
                value={
                  <Link href={`/customer/${orgId}/equipment/${w.asset_id}`} className="text-link hover:underline">
                    {w.asset?.asset_number}
                  </Link>
                }
              />
              <Row label="Description" value={w.description ? <span className="whitespace-pre-wrap">{w.description}</span> : null} />
              <Row label="Assigned to" value={w.kind === "vendor" ? `Vendor: ${w.vendor_name}` : (who(w.assigned_to) ?? "Not assigned")} />
              <Row label="Priority" value={<PriorityBadge priority={w.priority} />} />
              {w.required_qualification ? <Row label="Needs" value={QUALIFICATION_LABELS[w.required_qualification]} /> : null}
              <Row label="Due" value={w.due_on ? dmy(w.due_on) : null} />
              <Row label="Service plan" value={w.service_plan_id ? "Yes: closing records the service as done" : null} />
              <Row label="Started" value={when(w.started_at)} />
              <Row label="Completed" value={w.completed_at ? `${when(w.completed_at)} by ${who(w.completed_by) ?? "—"}` : null} />
              <Row label="Work done" value={w.completion_notes ? <span className="whitespace-pre-wrap">{w.completion_notes}</span> : null} />
              <Row
                label="Readings"
                value={[w.odometer_km !== null && `${w.odometer_km} km`, w.engine_hours !== null && `${w.engine_hours} h`].filter(Boolean).join(" · ") || null}
              />
              <Row label="Labour" value={w.labour_hours !== null ? `${w.labour_hours} h` : null} />
              <Row label="Cost" value={w.cost_cents !== null ? formatAud(w.cost_cents) : null} />
              <Row label="Closed" value={w.closed_at ? `${when(w.closed_at)} by ${who(w.closed_by) ?? "—"}${w.close_note ? `: ${w.close_note}` : ""}` : null} />
              {w.reopen_count ? <Row label="Reopened" value={`${w.reopen_count}× · last reason: ${w.last_reopen_reason ?? "—"}`} /> : null}
              {w.cancel_reason ? <Row label="Cancelled" value={w.cancel_reason} /> : null}
            </dl>
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Actions" description="Every change is recorded in the audit history." />
          <div className="px-5 pb-1">
            <Link href={`/customer/${orgId}/my-work/${w.id}`} className="text-[13px] font-medium text-link hover:underline">
              Pre/post-work reports and invoices →
            </Link>
          </div>
          <CardBody>
            {w.status === "closed" && !manager ? (
              <p className="text-[13.5px] text-ink-muted">This work order is closed.</p>
            ) : w.status === "cancelled" ? (
              <p className="text-[13.5px] text-ink-muted">This work order was cancelled.</p>
            ) : (
              <WorkOrderActions
                orgId={orgId}
                id={w.id}
                status={w.status}
                manager={manager}
                meters={{ km: mt === "kilometres" || mt === "both", hours: mt === "hours" || mt === "both" }}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
