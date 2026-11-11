import type { Metadata } from "next";
import Link from "next/link";
import { countOpenMissedPrestarts, listInspections, listMissedPrestarts } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { ResultBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import { ReviewMissedDialog } from "./missed-review";

export const metadata: Metadata = { title: "Inspections" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const OUTCOME = { not_used: { tone: "grey", text: "Not used" }, missed: { tone: "red", text: "Missed" }, open: { tone: "amber", text: "To review" } } as const;

/**
 * Submitted pre-starts (managers see the whole company; drivers their own, RLS)
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
  const db = await createSupabaseServerClient();
  const [rows, openCount, open, reviewed] = await Promise.all([
    tab === "submitted" ? listInspections(db, { organisationId: orgId, limit: 100 }) : Promise.resolve([]),
    reviewer ? countOpenMissedPrestarts(db, orgId).catch(() => 0) : Promise.resolve(0),
    tab === "missed" ? listMissedPrestarts(db, orgId, "open") : Promise.resolve([]),
    tab === "missed" ? listMissedPrestarts(db, orgId, "reviewed", 50) : Promise.resolve([]),
  ]);
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
            <TD>{m.frequency === "weekly" ? "Weekly" : "Daily"}</TD>
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
      <PageHeader title="Inspections" description="Pre-starts submitted for your equipment, newest first. Start a pre-start from the equipment page." />
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
          {rows.length === 0 ? (
            <EmptyState title="No pre-starts yet">Open a piece of equipment and choose Pre-start.</EmptyState>
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
          <p className="mb-4 text-[13.5px] text-ink-muted">
            Equipment that was due a pre-start and didn&apos;t get one (checked after each day ends; weekends are not counted for daily checks). Mark each as not
            used or missed. The pre-start frequency is set per equipment type and can be changed on each piece of equipment.
          </p>
          <Card>
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
