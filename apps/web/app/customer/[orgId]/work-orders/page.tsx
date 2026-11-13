import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWorkOrderNumber, listWorkOrders } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { NewWorkOrderDialog } from "@/features/maintenance/controls";
import { maintenanceOptions } from "@/features/maintenance/options";
import { PriorityBadge, WorkOrderStatusBadge } from "@/features/maintenance/badges";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Work Orders" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Work orders (CS-18): open ones first; finished ones on the second tab. */
export default async function WorkOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const manager = can(ctx.capabilities, "work_orders.manage");
  if (!manager && !can(ctx.capabilities, "work_orders.work")) notFound();
  const finished = firstParam(sp.view) === "finished";
  const db = await createSupabaseServerClient();
  const [rows, opts] = await Promise.all([listWorkOrders(db, orgId, { open: !finished }), maintenanceOptions(db, orgId)]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ctx.timezone });
  // Search and filters (as you type / as soon as one changes).
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60),
    status: firstParam(sp.status) ?? "",
    priority: firstParam(sp.priority) ?? "",
    who: firstParam(sp.who) ?? "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
  };
  const filtered = Object.values(f).some(Boolean);
  const shown = rows.filter((w) => {
    const name = w.kind === "vendor" ? (w.vendor_name ?? "") : w.assigned_to ? (opts.nameOf.get(w.assigned_to) ?? "") : "";
    if (f.q && ![formatWorkOrderNumber(w.number), w.title, w.description, w.asset?.asset_number, w.asset?.make, w.asset?.model, name].some((x) => (x ?? "").toLowerCase().includes(f.q))) return false;
    if (f.status && w.status !== f.status) return false;
    if (f.priority && w.priority !== f.priority) return false;
    if (f.who === "unassigned" ? !!w.assigned_to || w.kind === "vendor" : f.who === "vendor" ? w.kind !== "vendor" : f.who && w.assigned_to !== f.who) return false;
    if (f.from && (!w.due_on || w.due_on < f.from)) return false;
    if (f.to && (!w.due_on || w.due_on > f.to)) return false;
    return true;
  });
  const statusOptions = finished
    ? [
        { value: "closed", label: "Closed" },
        { value: "cancelled", label: "Cancelled" },
      ]
    : [
        { value: "open", label: "Open" },
        { value: "in_progress", label: "In progress" },
        { value: "completed", label: "To review" },
      ];
  const base = `/customer/${orgId}/work-orders`;
  const tab = (on: boolean, href: string, label: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium", on ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Work Orders"
        description="Repairs and services, done in-house or by a vendor."
        actions={manager ? <NewWorkOrderDialog orgId={orgId} equipment={opts.equipment} people={opts.people} /> : null}
      />
      <nav className="mb-5 flex gap-1 border-b border-stroke" aria-label="Work order views">
        {tab(!finished, base, "Open")}
        {tab(finished, `${base}?view=finished`, "Closed and cancelled")}
      </nav>
      <Card>
        <FilterBar
          action={base}
          keep={finished ? { view: "finished" } : {}}
          search={{ value: f.q, placeholder: "Number, work, equipment or person" }}
          fields={[
            { kind: "select", name: "status", label: "Status", all: "Any status", value: f.status, options: statusOptions },
            {
              kind: "select",
              name: "priority",
              label: "Priority",
              all: "Any priority",
              value: f.priority,
              options: [
                { value: "urgent", label: "Urgent" },
                { value: "high", label: "High" },
                { value: "normal", label: "Normal" },
                { value: "low", label: "Low" },
              ],
            },
            {
              kind: "select",
              name: "who",
              label: "Assigned to",
              all: "Anyone",
              value: f.who,
              options: [{ value: "unassigned", label: "Not assigned" }, { value: "vendor", label: "Vendors" }, ...opts.people],
            },
            { kind: "date", name: "from", label: "Due from", value: f.from },
            { kind: "date", name: "to", label: "Due to", value: f.to },
          ]}
        />
        {shown.length === 0 ? (
          filtered ? (
            <EmptyState title="No work orders match">Try a different search or filter.</EmptyState>
          ) : (
            <EmptyState title={finished ? "No finished work orders yet" : "No open work orders"}>
              {finished ? null : "Create one here, or from a service plan on an equipment's page."}
            </EmptyState>
          )
        ) : (
          <>
            {/* Phones: one card per work order. */}
            <ul className="divide-y divide-stroke sm:hidden">
              {shown.map((w) => {
                const overdue = !!w.due_on && w.due_on < today && !finished;
                return (
                  <li key={w.id} className="relative px-4 py-3 hover:bg-surface-hover">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`${base}/${w.id}`} className={cn("min-w-0", STRETCHED_LINK)}>
                        <span className="font-mono text-[12.5px] font-semibold text-ink-muted">{formatWorkOrderNumber(w.number)}</span>
                        <span className="block font-semibold text-ink">{w.title}</span>
                      </Link>
                      <WorkOrderStatusBadge status={w.status} />
                    </div>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {w.asset?.asset_number ?? "—"} · {w.kind === "vendor" ? w.vendor_name : w.assigned_to ? (opts.nameOf.get(w.assigned_to) ?? "Member") : "Not assigned"}
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 text-[13px]">
                      <PriorityBadge priority={w.priority} />
                      {w.due_on ? (
                        <span className={cn(overdue ? "font-semibold text-danger-ink" : "text-ink-muted")}>
                          {overdue ? "Overdue · " : "Due "}
                          {dmy(w.due_on)}
                        </span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block">
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>Equipment</TH>
                  <TH>Work</TH>
                  <TH>Assigned to</TH>
                  <TH>Priority</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {shown.map((w) => (
                  <TR key={w.id}>
                    <TD>
                      <Link href={`${base}/${w.id}`} className={cn("font-mono font-semibold text-link hover:underline", STRETCHED_LINK)}>
                        {formatWorkOrderNumber(w.number)}
                      </Link>
                    </TD>
                    <TD className="font-semibold">{w.asset?.asset_number ?? "—"}</TD>
                    <TD>{w.title}</TD>
                    <TD className="text-ink-muted">{w.kind === "vendor" ? w.vendor_name : w.assigned_to ? (opts.nameOf.get(w.assigned_to) ?? "Member") : "Not assigned"}</TD>
                    <TD>
                      <PriorityBadge priority={w.priority} />
                    </TD>
                    <TD className={cn("whitespace-nowrap", w.due_on && w.due_on < today && !finished ? "font-semibold text-danger-ink" : "text-ink-muted")}>
                      {w.due_on ? dmy(w.due_on) : "—"}
                      {w.due_on && w.due_on < today && !finished ? <span className="block text-[12px] font-medium">Overdue</span> : null}
                    </TD>
                    <TD>
                      <WorkOrderStatusBadge status={w.status} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
