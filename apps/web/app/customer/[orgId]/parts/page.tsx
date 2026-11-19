import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Plus, Truck } from "lucide-react";
import { formatPartsRequestNumber, getPersonNames, listPartsRequests, type PartsRequestStatus } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PARTS_STATUS, PartsStatusBadge } from "@/features/parts/status";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Parts" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const VIEWS = {
  open: { label: "Open", statuses: ["draft", "submitted", "approved", "ordered", "partially_received", "received"] },
  approval: { label: "Waiting for approval", statuses: ["submitted"] },
  finished: { label: "Closed, rejected and cancelled", statuses: ["closed", "rejected", "cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly PartsRequestStatus[] }>;

/** Parts requests (CS-20): from request to approval, order, receiving and fitting. */
export default async function PartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const canRequest = can(ctx.capabilities, "parts.request");
  const manage = can(ctx.capabilities, "parts.manage");
  if (!canRequest && !can(ctx.capabilities, "parts.approve") && !manage && !can(ctx.capabilities, "assets.costs.view")) notFound();
  const db = await createSupabaseServerClient();
  const all = await listPartsRequests(db, orgId);
  const names = await getPersonNames(db, [...new Set(all.map((r) => r.requested_by))]);
  const view = (firstParam(sp.view) ?? "open") as keyof typeof VIEWS;
  const tab = VIEWS[view] ? view : "open";
  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60),
    status: firstParam(sp.status) ?? "",
    urgency: firstParam(sp.urgency) ?? "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
  };
  const inTab = all.filter((r) => (VIEWS[tab].statuses as readonly string[]).includes(r.status));
  const rows = inTab.filter((r) => {
    const day = new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: ctx.timezone });
    return (
      (!f.q ||
        [formatPartsRequestNumber(r.number), r.asset?.asset_number, r.asset?.make, r.asset?.model, r.work_order?.title, r.notes, names.get(r.requested_by)].some((x) =>
          (x ?? "").toLowerCase().includes(f.q),
        )) &&
      (!f.status || r.status === f.status) &&
      (!f.urgency || r.urgency === f.urgency) &&
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to)
    );
  });
  const base = `/customer/${orgId}/parts`;
  const counts = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, all.filter((r) => (v.statuses as readonly string[]).includes(r.status)).length]));

  return (
    <>
      <PageHeader
        title="Parts"
        description="Request parts, approve within Approval Limits, record orders and deliveries, and fit them to jobs."
        actions={
          <>
            {manage ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`${base}/catalogue`}>
                    <BookOpen /> Catalogue
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`${base}/suppliers`}>
                    <Truck /> Suppliers
                  </Link>
                </Button>
              </>
            ) : null}
            {canRequest ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus /> New request
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Parts views">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
          <Link
            key={k}
            href={k === "open" ? base : `${base}?view=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap", tab === k ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {VIEWS[k].label}
            {counts[k] ? (
              <Badge tone={k === "approval" ? "amber" : "grey"} className="ml-2">
                {counts[k]}
              </Badge>
            ) : null}
          </Link>
        ))}
      </nav>
      <Card>
        <FilterBar
          action={base}
          keep={tab === "open" ? {} : { view: tab }}
          search={{ value: f.q, placeholder: "Number, equipment, job or person" }}
          fields={[
            {
              kind: "select",
              name: "status",
              label: "Status",
              all: "Any status",
              value: f.status,
              options: VIEWS[tab].statuses.map((s) => ({ value: s, label: PARTS_STATUS[s].label })),
            },
            {
              kind: "select",
              name: "urgency",
              label: "Urgency",
              all: "Any urgency",
              value: f.urgency,
              options: [
                { value: "urgent", label: "Urgent" },
                { value: "normal", label: "Normal" },
              ],
            },
            { kind: "date", name: "from", label: "Requested from", value: f.from },
            { kind: "date", name: "to", label: "Requested to", value: f.to },
          ]}
        />
        {rows.length === 0 ? (
          inTab.length ? (
            <EmptyState title="No requests match">Try a different search or filter.</EmptyState>
          ) : (
            <EmptyState title={tab === "approval" ? "Nothing waiting for approval" : tab === "finished" ? "Nothing finished yet" : "No open parts requests"}>
              {tab === "open" && canRequest ? "Use New request, or Request parts on a job." : null}
            </EmptyState>
          )
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Request</TH>
                <TH>Equipment</TH>
                <TH>For</TH>
                <TH>Status</TH>
                <TH>Needed by</TH>
                <TH>Requested</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`${base}/${r.id}`} className={cn("font-mono font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                      {formatPartsRequestNumber(r.number)}
                    </Link>
                    {r.urgency === "urgent" ? (
                      <Badge tone="red" className="ml-2">
                        Urgent
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="font-medium">{r.asset?.asset_number}</span>
                    <span className="block text-[12.5px] text-ink-muted">{[r.asset?.make, r.asset?.model].filter(Boolean).join(" ")}</span>
                  </TD>
                  <TD className="max-w-[240px] truncate text-ink-muted">{r.work_order ? `WO-${String(r.work_order.number).padStart(4, "0")} · ${r.work_order.title}` : "—"}</TD>
                  <TD>
                    <PartsStatusBadge status={r.status} />
                  </TD>
                  <TD className="whitespace-nowrap">{r.needed_by ? dmy(r.needed_by) : "—"}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">
                    {formatDateTimeAU(new Date(r.created_at), ctx.timezone)}
                    <span className="block text-[12px] text-ink-subtle">{names.get(r.requested_by) ?? "—"}</span>
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
