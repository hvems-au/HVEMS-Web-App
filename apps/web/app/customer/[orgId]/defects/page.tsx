import type { Metadata } from "next";
import Link from "next/link";
import { listActiveSafetyEvents, listDefects } from "@hvems/api-client";
import { ISSUE_CATEGORIES, DEFECT_SEVERITY_EFFECT, DEFECT_STATUS_LABELS, formatDateAU, formatDateTimeAU, todayISO } from "@hvems/domain";
import { SeverityBadge } from "@/components/safety";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Search } from "lucide-react";
import { can } from "@hvems/permissions";
import { DefectCheck, DefectsBulk } from "./bulk";
import { IssueCategoryTag } from "@/features/operator/issue-category";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardHeader, EmptyState, Table, TD, TH, THead, TR, STRETCHED_LINK } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Defects & Safety" };

const RANK = { critical: 0, minor: 1, advisory: 2 } as const;

/** Open defects (most serious first) and closed ones (newest first). */
export default async function DefectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ view?: string; type?: string; q?: string }>;
}) {
  const [{ orgId }, { view, type, q: rawQ }] = await Promise.all([params, searchParams]);
  const q = (typeof rawQ === "string" ? rawQ : "").trim().slice(0, 80);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const closed = view === "closed";
  const [all, safety] = await Promise.all([listDefects(db, { organisationId: orgId, limit: 300 }), listActiveSafetyEvents(db, { organisationId: orgId })]);
  const events = [
    ...safety.breakdowns.map((b) => ({
      id: b.id,
      assetId: b.asset_id,
      asset: b.asset?.asset_number,
      tone: "red" as const,
      label: "Breakdown",
      text: b.description,
      at: b.reported_at,
    })),
    ...safety.holds.map((h) => ({
      id: h.id,
      assetId: h.asset_id,
      asset: h.asset?.asset_number,
      tone: h.kind === "out_of_service" ? ("red" as const) : ("amber" as const),
      label: h.kind === "out_of_service" ? "Out-of-service hold" : "Needs-attention hold",
      text: h.reason,
      at: h.placed_at,
    })),
    ...safety.notices.map((n) => ({
      id: n.id,
      assetId: n.asset_id,
      asset: n.asset?.asset_number,
      tone: n.severity === "major" ? ("red" as const) : ("amber" as const),
      label: `${n.severity === "major" ? "Major" : n.severity === "minor" ? "Minor" : "Self-clearing"} defect notice`,
      text: `${n.authority}: ${n.details}`,
      at: n.recorded_at,
    })),
  ];
  const open = all.filter((d) => d.status === "open").sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.reported_at.localeCompare(a.reported_at));
  const done = all.filter((d) => d.status !== "open");
  const kind = type && (type === "prestart" || ISSUE_CATEGORIES.some((c) => c.value === type)) ? type : "";
  // Search (as you type): any part of the defect, its details or the equipment ID / make / model.
  const needle = q.toLowerCase();
  const rows = (closed ? done : open)
    .filter((d) => !kind || (kind === "prestart" ? d.source !== "operator_report" : d.issue_category === kind))
    .filter((d) => !needle || [d.title, d.description, d.asset?.asset_number, d.asset?.make, d.asset?.model].some((x) => (x ?? "").toLowerCase().includes(needle)));
  // Bulk close: for people who can clear defects (the database checks each one again).
  const canBulk = !closed && (can(ctx.capabilities, "defects.clear_non_critical") || can(ctx.capabilities, "defects.clear_critical"));
  const today = todayISO(ctx.timezone);
  const base = `/customer/${orgId}/defects`;

  return (
    <>
      <PageHeader title="Defects & Safety" description="Triage defects, mark repairs and return equipment to service" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-[8px] bg-surface-muted p-1 text-[14px] font-semibold sm:w-fit">
          {[
            { label: `Open (${open.length})`, href: base, on: !closed },
            {
              label: `Closed (${done.length})`,
              href: `${base}?view=closed`,
              on: closed,
            },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn("rounded-[6px] px-4 py-1.5", t.on ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <AutoFilterForm action={base} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {closed ? <input type="hidden" name="view" value="closed" /> : null}
          <span className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Defect, details or equipment"
              aria-label="Search defects"
              autoComplete="off"
              enterKeyHint="search"
              className={cn("h-10 pl-9 text-[13.5px]", SEARCH_FIELD)}
            />
          </span>
          <span className="w-full sm:w-56">
            <SearchableSelect
              name="type"
              value={kind}
              label="Kind of issue"
              all="All kinds of issue"
              options={[{ value: "prestart", label: "Pre-start faults" }, ...ISSUE_CATEGORIES.map((c) => ({ value: c.value as string, label: c.label as string }))]}
            />
          </span>
        </AutoFilterForm>
      </div>
      {!closed && events.length ? (
        <Card className="mb-5">
          <CardHeader title={`Holds, breakdowns and defect notices (${events.length})`} description="Manage them from the equipment page" />
          <ul className="divide-y divide-stroke">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[14px]">
                <Badge tone={e.tone}>{e.label}</Badge>
                <Link href={`/customer/${orgId}/equipment/${e.assetId}`} className="font-semibold text-link hover:underline">
                  {e.asset ?? "Equipment"}
                </Link>
                <span className="text-ink-muted">{e.text}</span>
                <span className="text-[12.5px] text-ink-subtle">{formatDateTimeAU(new Date(e.at), ctx.timezone)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={q || kind ? "No defects match" : closed ? "No closed defects yet" : "No open defects"}>
            Faults from pre-starts and issues reported by operators appear here.
          </EmptyState>
        ) : canBulk ? (
          <DefectsBulk orgId={orgId} ids={rows.map((d) => d.id)}>
            <Table>
              <THead>
                <tr>
                  {canBulk ? (
                    <TH className="w-px">
                      <span className="sr-only">Select</span>
                    </TH>
                  ) : null}
                  <TH>Defect</TH>
                  <TH>Kind</TH>
                  <TH>Severity</TH>
                  <TH>Equipment</TH>
                  <TH>{closed ? "Outcome" : "Status"}</TH>
                  <TH>Reported</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((d) => {
                  const due = d.deferred_until ?? d.due_date;
                  return (
                    <TR key={d.id}>
                      {canBulk ? (
                        <TD>
                          <DefectCheck id={d.id} label={d.title} />
                        </TD>
                      ) : null}
                      <TD className="max-w-[340px]">
                        <Link href={`${base}/${d.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                          {d.title}
                        </Link>
                        {d.description ? <span className="line-clamp-2 block text-[13px] text-ink-muted">“{d.description}”</span> : null}
                      </TD>
                      <TD className="text-[13px]">
                        <IssueCategoryTag value={d.issue_category} source={d.source} />
                      </TD>
                      <TD>
                        <span title={DEFECT_SEVERITY_EFFECT[d.severity]}>
                          <SeverityBadge severity={d.severity} />
                        </span>
                      </TD>
                      <TD>
                        <Link href={`/customer/${orgId}/equipment/${d.asset_id}`} className="relative z-10 font-medium text-link hover:underline">
                          {d.asset?.asset_number ?? "Equipment"}
                        </Link>
                      </TD>
                      <TD>
                        {closed ? (
                          <Badge tone={d.status === "repaired" ? "green" : "grey"}>{DEFECT_STATUS_LABELS[d.status]}</Badge>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {!d.triaged_at ? <Badge tone="blue">New</Badge> : <Badge tone="grey">Triaged</Badge>}
                            {due ? (
                              <Badge tone={due < today ? "red" : "grey"}>
                                {due < today ? "Overdue" : "Due"} {formatDateAU(new Date(`${due}T00:00:00Z`), "UTC")}
                              </Badge>
                            ) : null}
                          </span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </DefectsBulk>
        ) : (
          <Table>
            <THead>
              <tr>
                {canBulk ? (
                  <TH className="w-px">
                    <span className="sr-only">Select</span>
                  </TH>
                ) : null}
                <TH>Defect</TH>
                <TH>Kind</TH>
                <TH>Severity</TH>
                <TH>Equipment</TH>
                <TH>{closed ? "Outcome" : "Status"}</TH>
                <TH>Reported</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => {
                const due = d.deferred_until ?? d.due_date;
                return (
                  <TR key={d.id}>
                    {canBulk ? (
                      <TD>
                        <DefectCheck id={d.id} label={d.title} />
                      </TD>
                    ) : null}
                    <TD className="max-w-[340px]">
                      <Link href={`${base}/${d.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                        {d.title}
                      </Link>
                      {d.description ? <span className="line-clamp-2 block text-[13px] text-ink-muted">“{d.description}”</span> : null}
                    </TD>
                    <TD className="text-[13px]">
                      <IssueCategoryTag value={d.issue_category} source={d.source} />
                    </TD>
                    <TD>
                      <span title={DEFECT_SEVERITY_EFFECT[d.severity]}>
                        <SeverityBadge severity={d.severity} />
                      </span>
                    </TD>
                    <TD>
                      <Link href={`/customer/${orgId}/equipment/${d.asset_id}`} className="relative z-10 font-medium text-link hover:underline">
                        {d.asset?.asset_number ?? "Equipment"}
                      </Link>
                    </TD>
                    <TD>
                      {closed ? (
                        <Badge tone={d.status === "repaired" ? "green" : "grey"}>{DEFECT_STATUS_LABELS[d.status]}</Badge>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {!d.triaged_at ? <Badge tone="blue">New</Badge> : <Badge tone="grey">Triaged</Badge>}
                          {due ? (
                            <Badge tone={due < today ? "red" : "grey"}>
                              {due < today ? "Overdue" : "Due"} {formatDateAU(new Date(`${due}T00:00:00Z`), "UTC")}
                            </Badge>
                          ) : null}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
