import "server-only";
import { getPersonNames, listAssetsForExport, reportRows, type HvemsClient } from "@hvems/api-client";
import { startOfDayInZone, todayISO } from "@hvems/domain";

export type ComplianceSummary = {
  from: string;
  to: string;
  assets: { current: number; added: number; archived: number };
  inspections: { expected: number; done: number; pass: number; faults: number; fail: number; missed: number; notReviewed: number; notUsed: number; completion: number | null };
  services: { done: number; dueInPeriod: number; missed: number; overdueNow: number };
  defects: { raised: number; critical: number; minor: number; advisory: number; cleared: number; deferred: number; outstanding: number };
  notices: { issued: number; cleared: number; open: number };
  deferrals: { when: string; asset: string; defect: string; to: string; reason: string; approver: string }[];
  returns: { when: string; asset: string; by: string; note: string; evidence: number }[];
};

/** Default period: the first of this month to today (business calendar). */
export function compliancePeriod(sp: Record<string, string | string[] | undefined>, tz: string): { from: string; to: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const today = todayISO(tz);
  const from = iso.test(one("from")) ? one("from") : `${today.slice(0, 8)}01`;
  const to = iso.test(one("to")) ? one("to") : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Compliance summary for a period (RPT-03), from what the person may read. Counts are by business day (dd/mm/yyyy). */
export async function buildCompliance(db: HvemsClient, orgId: string, tz: string, from: string, to: string): Promise<ComplianceSummary> {
  const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: tz }) : null);
  const inP = (d: string | null | undefined) => !!d && d >= from && d <= to;
  const dmyt = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const lo = new Date(startOfDayInZone(from, tz).getTime() - 86400000).toISOString();
  const hi = new Date(startOfDayInZone(to, tz).getTime() + 2 * 86400000).toISOString();
  const today = todayISO(tz);

  type D = {
    asset_id: string;
    title: string;
    severity: string;
    status: string;
    reported_at: string;
    closed_at: string | null;
    deferred_until: string | null;
    deferral_reason: string | null;
    deferred_by: string | null;
    deferred_at: string | null;
    due_date: string | null;
  };
  const [current, archived, inspections, missed, plans, wos, defects, notices, returns] = await Promise.all([
    listAssetsForExport(db, { organisationId: orgId, status: "current" }),
    listAssetsForExport(db, { organisationId: orgId, status: "archived" }),
    reportRows<{ result: string; submitted_at: string }>(db, "inspections", "result, submitted_at", orgId, { dateColumn: "submitted_at", from: lo, to: hi, order: "submitted_at" }),
    reportRows<{ status: string; period_start: string }>(db, "missed_prestarts", "status, period_start", orgId, { dateColumn: "period_start", from, to, order: "period_start" }),
    reportRows<{ next_due_on: string | null; status: string }>(db, "service_schedule", "next_due_on, status", orgId, { order: "id" }),
    reportRows<{ service_plan_id: string | null; status: string; closed_at: string | null }>(db, "work_orders", "service_plan_id, status, closed_at", orgId, {
      dateColumn: "closed_at",
      from: lo,
      to: hi,
      order: "closed_at",
    }),
    reportRows<D>(db, "defects", "asset_id, title, severity, status, reported_at, closed_at, deferred_until, deferral_reason, deferred_by, deferred_at, due_date", orgId, { order: "reported_at" }),
    reportRows<{ status: string; issued_on: string; cleared_on: string | null }>(db, "regulator_notices", "status, issued_on, cleared_on", orgId, { order: "issued_on" }),
    reportRows<{ asset_id: string; returned_by: string; returned_at: string; note: string; evidence_paths: string[] }>(
      db,
      "return_to_service_events",
      "asset_id, returned_by, returned_at, note, evidence_paths",
      orgId,
      { dateColumn: "returned_at", from: lo, to: hi, order: "returned_at" },
    ),
  ]);
  const assetNo = new Map([...current, ...archived].map((a) => [a.id, a.asset_number]));

  const done = inspections.filter((i) => inP(dayOf(i.submitted_at)));
  const missedIn = missed.filter((m) => inP(m.period_start));
  const missedCount = missedIn.filter((m) => m.status === "missed").length;
  const notReviewed = missedIn.filter((m) => m.status === "open").length;
  const notUsed = missedIn.filter((m) => m.status === "not_used").length;
  // Expected = done + periods that should have had one (not-used periods are excused).
  const expected = done.length + missedCount + notReviewed;

  const servicesDone = wos.filter((w) => w.service_plan_id && w.status === "closed" && inP(dayOf(w.closed_at))).length;
  const dueInPeriod = plans.filter((p) => inP(p.next_due_on)).length;
  const servicesMissed = plans.filter((p) => inP(p.next_due_on) && p.next_due_on! < today).length;

  const raised = defects.filter((d) => inP(dayOf(d.reported_at)));
  const deferred = defects.filter((d) => d.deferred_at && inP(dayOf(d.deferred_at)));
  const names = await getPersonNames(db, [...new Set([...deferred.map((d) => d.deferred_by), ...returns.map((r) => r.returned_by)])]);
  const nm = (id: string | null) => (id ? (names.get(id) ?? "Former member") : "—");

  return {
    from,
    to,
    assets: {
      current: current.length,
      added: [...current, ...archived].filter((a) => inP(dayOf(a.created_at))).length,
      archived: archived.filter((a) => inP(dayOf(a.archived_at))).length,
    },
    inspections: {
      expected,
      done: done.length,
      pass: done.filter((i) => i.result === "pass").length,
      faults: done.filter((i) => i.result === "pass_with_faults").length,
      fail: done.filter((i) => i.result === "fail").length,
      missed: missedCount,
      notReviewed,
      notUsed,
      completion: expected ? Math.round((done.length / expected) * 1000) / 10 : null,
    },
    services: { done: servicesDone, dueInPeriod, missed: servicesMissed, overdueNow: plans.filter((p) => p.status === "overdue").length },
    defects: {
      raised: raised.length,
      critical: raised.filter((d) => d.severity === "critical").length,
      minor: raised.filter((d) => d.severity === "minor").length,
      advisory: raised.filter((d) => d.severity === "advisory").length,
      cleared: defects.filter((d) => d.status === "repaired" && inP(dayOf(d.closed_at))).length,
      deferred: deferred.length,
      outstanding: defects.filter((d) => d.status === "open" && (dayOf(d.reported_at) ?? "") <= to).length,
    },
    notices: {
      issued: notices.filter((n) => inP(n.issued_on)).length,
      cleared: notices.filter((n) => inP(n.cleared_on)).length,
      open: notices.filter((n) => n.status === "open" && n.issued_on <= to).length,
    },
    deferrals: deferred.map((d) => ({
      when: d.deferred_at ? dmyt(d.deferred_at) : "",
      asset: assetNo.get(d.asset_id) ?? "—",
      defect: d.title,
      to: dmy(d.deferred_until),
      reason: d.deferral_reason ?? "",
      approver: nm(d.deferred_by),
    })),
    returns: returns
      .filter((r) => inP(dayOf(r.returned_at)))
      .map((r) => ({ when: dmyt(r.returned_at), asset: assetNo.get(r.asset_id) ?? "—", by: nm(r.returned_by), note: r.note, evidence: r.evidence_paths?.length ?? 0 })),
  };
}

/** The summary as label/value lines (screen sections, CSV and PDF all use these). */
export function complianceSections(c: ComplianceSummary): { title: string; definition: string; lines: [string, string | number][] }[] {
  return [
    {
      title: "Equipment",
      definition: "Current equipment today; added and archived within the period.",
      lines: [
        ["Current equipment", c.assets.current],
        ["Added in period", c.assets.added],
        ["Archived in period", c.assets.archived],
      ],
    },
    {
      title: "Pre-start inspections",
      definition: "Expected = done + missed periods (not reviewed or marked missed). Periods marked not used are excused.",
      lines: [
        ["Expected", c.inspections.expected],
        ["Done", c.inspections.done],
        ["Passed", c.inspections.pass],
        ["Passed with faults", c.inspections.faults],
        ["Failed", c.inspections.fail],
        ["Missed (confirmed)", c.inspections.missed],
        ["Missed (not reviewed)", c.inspections.notReviewed],
        ["Not used (excused)", c.inspections.notUsed],
        ["Completion", c.inspections.completion === null ? "—" : `${c.inspections.completion}%`],
      ],
    },
    {
      title: "Services",
      definition: "Done = closed work orders linked to a service plan. Due = plans whose next due date falls in the period; missed = those past due and still not done.",
      lines: [
        ["Done in period", c.services.done],
        ["Due in period, not yet done", c.services.dueInPeriod],
        ["Missed (past due)", c.services.missed],
        ["Overdue today", c.services.overdueNow],
      ],
    },
    {
      title: "Defects",
      definition: "Raised, cleared and deferred within the period; outstanding = raised by the end of the period and still open today.",
      lines: [
        ["Raised", c.defects.raised],
        ["Critical", c.defects.critical],
        ["Minor", c.defects.minor],
        ["Advisory", c.defects.advisory],
        ["Cleared (repaired)", c.defects.cleared],
        ["Deferred", c.defects.deferred],
        ["Outstanding", c.defects.outstanding],
      ],
    },
    {
      title: "Regulator notices",
      definition: "Issued and cleared within the period; open = issued by the end of the period and not cleared today.",
      lines: [
        ["Issued", c.notices.issued],
        ["Cleared", c.notices.cleared],
        ["Open", c.notices.open],
      ],
    },
  ];
}
