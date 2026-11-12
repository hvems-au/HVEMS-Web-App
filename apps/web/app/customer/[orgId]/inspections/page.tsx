import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { countOpenMissedPrestarts, getPersonNames, listInspections, listMissedPrestarts } from "@hvems/api-client";
import { INSPECTION_RESULT_LABELS, formatDateTimeAU, startOfDayInZone, type InspectionResultValue } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { ResultBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import { MissedBulkTable } from "./missed-bulk";

export const metadata: Metadata = { title: "Inspections" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const CHECK = { daily: "Daily", weekly: "Weekly", custom: "Custom", not_required: "—" } as const;
const OUTCOME = { not_used: { tone: "grey", text: "Not used" }, missed: { tone: "red", text: "Missed" }, open: { tone: "amber", text: "To review" } } as const;

/**
 * Submitted pre-starts (managers see the whole company; operators their own, RLS)
 * and, for managers, missed pre-starts to review (2B).
 */
export default async function InspectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const reviewer = can(ctx.capabilities, "inspections.review");
  const tab = reviewer && firstParam(sp.tab) === "missed" ? "missed" : "submitted";
  // Filters (from the query string; anything unknown is ignored).
  const f = {
    asset: firstParam(sp.asset) ?? "",
    operator: firstParam(sp.operator) ?? "",
    result: (firstParam(sp.result) ?? "") as InspectionResultValue | "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
    check: (firstParam(sp.check) ?? "") as "" | "daily" | "weekly" | "custom",
    q: (firstParam(sp.q) ?? "").trim().slice(0, 60),
  };
  if (!(f.result in INSPECTION_RESULT_LABELS)) f.result = "";
  if (!["daily", "weekly", "custom"].includes(f.check)) f.check = "";
  const db = await createSupabaseServerClient();
  // Search: equipment by ID, make, model, rego or VIN (and, for pre-starts, the operator's name).
  const term = f.q.replace(/[%_,()*"\\]/g, " ").trim();
  const searchAssetIds = term
    ? await db
        .from("assets")
        .select("id")
        .eq("organisation_id", orgId)
        .or(["asset_number", "make", "model", "registration_number", "vin"].map((c) => `${c}.ilike.*${term}*`).join(","))
        .limit(500)
        .then((r) => ((r.data ?? []) as { id: string }[]).map((a) => a.id))
    : null;
  const missedFilter = { assetId: f.asset || undefined, frequency: f.check || undefined, assetIds: searchAssetIds ?? undefined, from: f.from || undefined, to: f.to || undefined };
  const [rows, openCount, open, reviewed, assets, operatorIds] = await Promise.all([
    tab === "submitted"
      ? listInspections(db, {
          organisationId: orgId,
          assetId: f.asset || undefined,
          submittedBy: f.operator || undefined,
          result: f.result || undefined,
          from: f.from ? startOfDayInZone(f.from, ctx.timezone) : undefined,
          to: f.to ? startOfDayInZone(nextDay(f.to), ctx.timezone) : undefined,
          search: term ? { text: term, assetIds: searchAssetIds ?? [] } : undefined,
          limit: 100,
        })
      : Promise.resolve([]),
    reviewer ? countOpenMissedPrestarts(db, orgId).catch(() => 0) : Promise.resolve(0),
    tab === "missed" ? listMissedPrestarts(db, orgId, "open", 200, missedFilter) : Promise.resolve([]),
    tab === "missed" ? listMissedPrestarts(db, orgId, "reviewed", 50, missedFilter) : Promise.resolve([]),
    db
      .from("assets")
      .select("id, asset_number")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("asset_number")
      .limit(2000)
      .then((r) => (r.data ?? []) as { id: string; asset_number: string }[]),
    // Everyone who has submitted a pre-start here (RLS limits what each person sees).
    db
      .from("inspections")
      .select("submitted_by")
      .eq("organisation_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(1000)
      .then((r) => [...new Set(((r.data ?? []) as { submitted_by: string }[]).map((x) => x.submitted_by))]),
  ]);
  const names = await getPersonNames(db, operatorIds);
  const equipmentOptions = assets.map((a) => ({ value: a.id, label: a.asset_number }));
  const operatorOptions = operatorIds.map((id) => ({ value: id, label: names.get(id) ?? "Former operator" })).sort((a, b) => a.label.localeCompare(b.label));
  const filtered = Object.values(f).some(Boolean);
  const base = `/customer/${orgId}/inspections`;
  const tabLink = (id: "submitted" | "missed", label: React.ReactNode) => (
    <Link
      href={id === "submitted" ? base : `${base}?tab=missed`}
      aria-current={tab === id ? "page" : undefined}
      className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium", tab === id ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
    >
      {label}
    </Link>
  );
  const missedTable = (items: typeof open) => (
    <Table>
      <THead>
        <tr>
          <TH>Due</TH>
          <TH>Equipment</TH>
          <TH>Check</TH>
          <TH>Status</TH>
          <TH>Note</TH>
        </tr>
      </THead>
      <tbody>
        {items.map((m) => (
          <TR key={m.id}>
            <TD className="whitespace-nowrap">{m.period_start === m.period_end ? dmy(m.period_start) : `${dmy(m.period_start)} – ${dmy(m.period_end)}`}</TD>
            <TD>
              <Link href={`/customer/${orgId}/equipment/${m.asset_id}`} className="font-semibold text-link hover:underline">
                {m.asset?.asset_number ?? "Equipment"}
              </Link>
              <span className="block text-[12.5px] text-ink-subtle">{[m.asset?.make, m.asset?.model].filter(Boolean).join(" ")}</span>
            </TD>
            <TD>{CHECK[m.frequency]}</TD>
            <TD>
              <Badge tone={OUTCOME[m.status].tone}>{OUTCOME[m.status].text}</Badge>
            </TD>
            <TD className="max-w-[360px] text-ink-muted">
              {m.review_note ?? "—"}
              {m.reviewed_at ? <span className="block text-[12px] text-ink-subtle">{formatDateTimeAU(new Date(m.reviewed_at), ctx.timezone)}</span> : null}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );

  return (
    <>
      <PageHeader title="Inspections" description="Submitted pre-starts, newest first." />
      {reviewer ? (
        <nav className="mb-5 flex gap-1 border-b border-stroke" aria-label="Inspection views">
          {tabLink("submitted", "Pre-starts")}
          {tabLink(
            "missed",
            <>
              Missed
              {openCount ? (
                <Badge tone="amber" className="ml-2">
                  {openCount}
                </Badge>
              ) : null}
            </>,
          )}
        </nav>
      ) : null}
      {tab === "submitted" ? (
        <Card>
          <FilterBar
            action={base}
            search={{ value: f.q, placeholder: "Equipment, rego, operator" }}
            fields={[
              { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipmentOptions },
              { kind: "select", name: "operator", label: "Operator", all: "All operators", value: f.operator, options: operatorOptions },
              {
                kind: "select",
                name: "result",
                label: "Result",
                all: "Any result",
                value: f.result,
                options: Object.entries(INSPECTION_RESULT_LABELS).map(([value, label]) => ({ value, label })),
              },
              { kind: "date", name: "from", label: "From", value: f.from },
              { kind: "date", name: "to", label: "To", value: f.to },
            ]}
          />
          {rows.length === 0 ? (
            filtered ? (
              <EmptyState title="No pre-starts match these filters" />
            ) : (
              <EmptyState title="No pre-starts yet">Open a piece of equipment and choose Pre-start.</EmptyState>
            )
          ) : (
            <>
              <p className="px-4 pt-3 text-[13px] text-ink-muted" aria-live="polite">
                {rows.length === 100 ? "Latest 100 pre-starts" : `${rows.length} pre-start${rows.length === 1 ? "" : "s"}`}
                {filtered ? " matching your filters" : ""}
              </p>
              {/* Phones: one card per pre-start; the whole card opens it. */}
              <ul className="divide-y divide-stroke sm:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="relative px-4 py-3 hover:bg-surface-hover">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/customer/${orgId}/inspections/${r.id}`} className={cn("min-w-0 font-semibold text-ink", STRETCHED_LINK)}>
                        {r.header.asset_number}
                        <span className="block truncate text-[13px] font-normal text-ink-muted">{[r.header.make, r.header.model].filter(Boolean).join(" ")}</span>
                      </Link>
                      <ResultBadge result={r.result} />
                    </div>
                    <p className="mt-1.5 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
                      <span className="truncate">{r.header.operator_name ?? "Unknown operator"}</span>
                      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                        {formatDateTimeAU(new Date(r.submitted_at), ctx.timezone)}
                        <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
              {/* Larger screens: a table; the whole row opens the pre-start. */}
              <div className="hidden sm:block">
                <Table>
                  <THead>
                    <tr>
                      <TH>Equipment</TH>
                      <TH>Result</TH>
                      <TH>Operator</TH>
                      <TH>Submitted</TH>
                      <TH className="w-px">
                        <span className="sr-only">Open</span>
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/customer/${orgId}/inspections/${r.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                            {r.header.asset_number}
                          </Link>
                          <span className="block text-[12.5px] text-ink-muted">{[r.header.make, r.header.model].filter(Boolean).join(" ")}</span>
                        </TD>
                        <TD>
                          <ResultBadge result={r.result} />
                        </TD>
                        <TD>{r.header.operator_name ?? "—"}</TD>
                        <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(r.submitted_at), ctx.timezone)}</TD>
                        <TD className="text-right">
                          <span className="inline-flex items-center gap-0.5 text-[13px] font-medium text-link">
                            View <ChevronRight className="size-4" aria-hidden />
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Card>
      ) : (
        <>
          <p className="mb-4 text-[13.5px] text-ink-muted">Equipment that was due a pre-start and didn&apos;t get one. Tick several to mark them not used or missed in one go, or review one at a time.</p>
          <Card>
            <FilterBar
              action={base}
              keep={{ tab: "missed" }}
              search={{ value: f.q, placeholder: "Equipment, make, rego" }}
              fields={[
                { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipmentOptions },
                {
                  kind: "select",
                  name: "check",
                  label: "Check",
                  all: "Any check",
                  value: f.check,
                  options: [
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "custom", label: "Custom" },
                  ],
                },
                { kind: "date", name: "from", label: "Due from", value: f.from },
                { kind: "date", name: "to", label: "Due to", value: f.to },
              ]}
            />
            {open.length === 0 ? (
              filtered ? (
                <EmptyState title="Nothing matches">Try a different search or filter.</EmptyState>
              ) : (
                <EmptyState title="Nothing to review">Every pre-start that was due has been done or reviewed.</EmptyState>
              )
            ) : (
              <MissedBulkTable
                orgId={orgId}
                rows={open.map((m) => ({
                  id: m.id,
                  due: m.period_start === m.period_end ? dmy(m.period_start) : `${dmy(m.period_start)} – ${dmy(m.period_end)}`,
                  assetId: m.asset_id,
                  assetNumber: m.asset?.asset_number ?? "Equipment",
                  makeModel: [m.asset?.make, m.asset?.model].filter(Boolean).join(" "),
                  check: CHECK[m.frequency],
                }))}
              />
            )}
          </Card>
          {reviewed.length ? (
            <Card className="mt-5">
              <div className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">Reviewed</div>
              {missedTable(reviewed)}
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
