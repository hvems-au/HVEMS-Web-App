import type { Metadata } from "next";
import Link from "next/link";
import { countOpenMissedPrestarts, getPersonNames, listInspections, listMissedPrestarts } from "@hvems/api-client";
import { INSPECTION_RESULT_LABELS, formatDateTimeAU, startOfDayInZone, type InspectionResultValue } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { ResultBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import { ReviewMissedDialog } from "./missed-review";

export const metadata: Metadata = { title: "Inspections" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const ISO = /^d{4}-d{2}-d{2}$/;
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
  };
  if (!(f.result in INSPECTION_RESULT_LABELS)) f.result = "";
  if (!["daily", "weekly", "custom"].includes(f.check)) f.check = "";
  const db = await createSupabaseServerClient();
  const missedFilter = { assetId: f.asset || undefined, frequency: f.check || undefined };
  const [rows, openCount, open, reviewed, assets, operatorIds] = await Promise.all([
    tab === "submitted"
      ? listInspections(db, {
          organisationId: orgId,
          assetId: f.asset || undefined,
          submittedBy: f.operator || undefined,
          result: f.result || undefined,
          from: f.from ? startOfDayInZone(f.from, ctx.timezone) : undefined,
          to: f.to ? startOfDayInZone(nextDay(f.to), ctx.timezone) : undefined,
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
      className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium", tab === id ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
    >
      {label}
    </Link>
  );
  const missedTable = (items: typeof open, reviewedList: boolean) => (
    <Table>
      <THead>
        <tr>
          <TH>Due</TH>
          <TH>Equipment</TH>
          <TH>Check</TH>
          <TH>Status</TH>
          {reviewedList ? <TH>Note</TH> : <TH className="text-right">Actions</TH>}
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
            {reviewedList ? (
              <TD className="max-w-[360px] text-ink-muted">
                {m.review_note ?? "—"}
                {m.reviewed_at ? <span className="block text-[12px] text-ink-subtle">{formatDateTimeAU(new Date(m.reviewed_at), ctx.timezone)}</span> : null}
              </TD>
            ) : (
              <TD className="text-right">
                <ReviewMissedDialog orgId={orgId} id={m.id} label={`${m.asset?.asset_number ?? "Equipment"}, ${dmy(m.period_start)}`} />
              </TD>
            )}
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
            <Table>
              <THead>
                <tr>
                  <TH>Submitted</TH>
                  <TH>Equipment</TH>
                  <TH>Operator</TH>
                  <TH>Result</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={`/customer/${orgId}/inspections/${r.id}`} className="font-semibold text-link hover:underline">
                        {formatDateTimeAU(new Date(r.submitted_at), ctx.timezone)}
                      </Link>
                    </TD>
                    <TD>
                      <span className="font-semibold">{r.header.asset_number}</span>
                      <span className="block text-[12.5px] text-ink-subtle">{[r.header.make, r.header.model].filter(Boolean).join(" ")}</span>
                    </TD>
                    <TD>{r.header.operator_name ?? "—"}</TD>
                    <TD>
                      <ResultBadge result={r.result} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <>
          <p className="mb-4 text-[13.5px] text-ink-muted">Equipment that was due a pre-start and didn&apos;t get one. Mark each as not used or missed.</p>
          <Card>
            <FilterBar
              action={base}
              keep={{ tab: "missed" }}
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
              ]}
            />
            {open.length === 0 ? <EmptyState title="Nothing to review">Every pre-start that was due has been done or reviewed.</EmptyState> : missedTable(open, false)}
          </Card>
          {reviewed.length ? (
            <Card className="mt-5">
              <div className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">Reviewed</div>
              {missedTable(reviewed, true)}
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
