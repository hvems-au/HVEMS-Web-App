import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { listServiceSchedule, type ServiceScheduleRow } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { AddServicePlanDialog, NewWorkOrderDialog } from "@/features/maintenance/controls";
import { maintenanceOptions } from "@/features/maintenance/options";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Maintenance" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const n = (v: number | null) => (v === null ? "" : Number(v).toLocaleString("en-AU", { maximumFractionDigits: 1 }));
const STATUS = { overdue: { tone: "red", text: "Overdue" }, due_soon: { tone: "amber", text: "Due soon" }, ok: { tone: "green", text: "OK" } } as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function every(r: ServiceScheduleRow) {
  return [r.interval_days && `${r.interval_days} days`, r.interval_km && `${n(r.interval_km)} km`, r.interval_hours && `${n(r.interval_hours)} h`].filter(Boolean).join(" / ");
}
function nextDue(r: ServiceScheduleRow) {
  const parts: string[] = [];
  if (r.next_due_on) parts.push(dmy(r.next_due_on));
  if (r.next_due_km !== null) parts.push(`${n(r.next_due_km)} km${r.current_km !== null ? ` (now ${n(r.current_km)})` : ""}`);
  if (r.next_due_hours !== null) parts.push(`${n(r.next_due_hours)} h${r.current_hours !== null ? ` (now ${n(r.current_hours)})` : ""}`);
  return parts.join(" · ") || "—";
}

/**
 * The whole fleet's service schedule at a glance (CS-17). Plans are added and
 * changed on each equipment's page (Maintenance section); this page is for
 * finding what's due.
 */
export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "work_orders.manage") && !can(ctx.capabilities, "work_orders.work")) notFound();
  const db = await createSupabaseServerClient();
  const manager = can(ctx.capabilities, "work_orders.manage");
  const [all, opts] = await Promise.all([listServiceSchedule(db, orgId), manager ? maintenanceOptions(db, orgId) : Promise.resolve(null)]);
  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60),
    status: ["overdue", "due_soon", "ok"].includes(firstParam(sp.status) ?? "") ? (firstParam(sp.status) as ServiceScheduleRow["status"]) : "",
    asset: firstParam(sp.asset) ?? "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
  };
  const rows = all.filter(
    (r) =>
      (!f.q || [r.name, r.asset?.asset_number, r.notes].some((x) => (x ?? "").toLowerCase().includes(f.q))) &&
      (!f.status || r.status === f.status) &&
      (!f.asset || r.asset_id === f.asset) &&
      (!f.from || (r.next_due_on ?? "") >= f.from) &&
      (!f.to || (r.next_due_on !== null && r.next_due_on <= f.to)),
  );
  const counts = { overdue: all.filter((r) => r.status === "overdue").length, due_soon: all.filter((r) => r.status === "due_soon").length };
  const equipmentOptions = [...new Map(all.map((r) => [r.asset_id, r.asset?.asset_number ?? "—"])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const base = `/customer/${orgId}/maintenance`;
  const filtered = Object.values(f).some(Boolean);

  return (
    <>
      <PageHeader
        title="Maintenance"
        description={`Service schedule for the whole fleet: ${counts.overdue} overdue, ${counts.due_soon} due soon. Each plan also shows on its equipment's page.`}
        actions={opts ? <AddServicePlanDialog orgId={orgId} equipment={opts.equipment} /> : null}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: `Overdue (${counts.overdue})`, value: "overdue", tone: "border-danger/40 text-danger-ink" },
          { label: `Due soon (${counts.due_soon})`, value: "due_soon", tone: "border-warn-line text-warn-ink" },
        ].map((c) => (
          <Link
            key={c.value}
            href={f.status === c.value ? base : `${base}?status=${c.value}`}
            className={cn(
              "rounded-full border bg-surface px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-surface-hover",
              c.tone,
              f.status === c.value && "ring-2 ring-brand/30",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <Card>
        <FilterBar
          action={base}
          search={{ value: f.q, placeholder: "Service or equipment" }}
          fields={[
            {
              kind: "select",
              name: "status",
              label: "Status",
              all: "Any status",
              value: f.status,
              options: [
                { value: "overdue", label: "Overdue" },
                { value: "due_soon", label: "Due soon" },
                { value: "ok", label: "OK" },
              ],
            },
            { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipmentOptions },
            { kind: "date", name: "from", label: "Due from", value: f.from },
            { kind: "date", name: "to", label: "Due to", value: f.to },
          ]}
        />
        {rows.length === 0 ? (
          filtered ? (
            <EmptyState title="Nothing matches">Try a different search or filter.</EmptyState>
          ) : (
            <EmptyState title="No service plans yet">Add one with Add service plan, or from an equipment's Maintenance section.</EmptyState>
          )
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Equipment</TH>
                <TH>Service</TH>
                <TH>Every</TH>
                <TH>Next due</TH>
                <TH>Status</TH>
                <TH className="text-right">{opts ? "Actions" : <span className="sr-only">Open</span>}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/customer/${orgId}/equipment/${r.asset_id}#maintenance`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                      {r.asset?.asset_number}
                    </Link>
                  </TD>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-ink-muted">{every(r)}</TD>
                  <TD>
                    {nextDue(r)}
                    {r.next_due_chosen ? <span className="block text-[12px] text-ink-subtle">Chosen at the last service</span> : null}
                  </TD>
                  <TD>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
                  </TD>
                  <TD className="text-right">
                    {opts ? (
                      <span className="relative z-10 inline-flex">
                        <NewWorkOrderDialog
                          orgId={orgId}
                          equipment={opts.equipment}
                          people={opts.people}
                          preset={{ asset_id: r.asset_id, title: r.name, service_plan_id: r.id }}
                          label="Work order"
                          variant="secondary"
                        />
                      </span>
                    ) : (
                      <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
