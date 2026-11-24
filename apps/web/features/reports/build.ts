import "server-only";
import {
  browseMarketplaceJobs,
  formatPartsRequestNumber,
  getPersonNames,
  listAssetsForExport,
  listMyProposals,
  REPORT_ROW_LIMIT,
  reportRows,
  type HvemsClient,
} from "@hvems/api-client";
import { ENGAGEMENT_STATUS, JOB_STATUS, PROPOSAL_STATUS, PROVIDER_CATEGORIES, priceText } from "@/features/marketplace/labels";
import {
  CONDITION_LABELS,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  INSPECTION_RESULT_LABELS,
  OWNER_TYPE_LABELS,
  issueCategoryLabel,
  startOfDayInZone,
  todayISO,
} from "@hvems/domain";
import { FUEL_TYPES } from "@/features/fuel/types";
import { PARTS_STATUS } from "@/features/parts/status";
import type { ReportKey } from "./catalogue";

export type Cell = string | number | null;
export type ReportFilters = { from: string; to: string; site: string; client: string; asset: string; class: string; status: string };
export type BuiltReport = {
  columns: string[];
  rows: Cell[][];
  /** Headline figures shown on screen (the CSV holds the same rows). */
  totals: { label: string; value: string }[];
  statuses: { value: string; label: string }[];
  truncated: boolean;
};

type Row = { cells: Cell[]; day: string | null; assetId: string | null; status: string | null; amount?: number };
type AssetInfo = { number: string; make: string; model: string; cls: string; clsName: string; site: string; siteName: string; client: string; clientName: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KIND_LABELS = { parts: "Parts", labour: "Labour", external: "Outside work", fuel: "Fuel", other: "Other" } as Record<string, string>;
const WO_STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", completed: "Completed", closed: "Closed", cancelled: "Cancelled" };
const SERVICE_STATUS: Record<string, string> = { ok: "OK", due_soon: "Due soon", overdue: "Overdue" };
const MISSED: Record<string, string> = { open: "Missed: not reviewed", not_used: "Not used", missed: "Missed" };
const NOTICE_SEVERITY: Record<string, string> = { major: "Major", minor: "Minor", self_clearing: "Self-clearing" };
const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : Math.round(cents) / 100);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function parseReportFilters(sp: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  return {
    from: ISO.test(one("from")) ? one("from") : "",
    to: ISO.test(one("to")) ? one("to") : "",
    site: one("site").slice(0, 40),
    client: one("client").slice(0, 40),
    asset: one("asset").slice(0, 40),
    class: one("class").slice(0, 60),
    status: one("status").slice(0, 40),
  };
}

/** Builds one report from what the person may read (RLS), filtered the same way on screen and in the CSV. */
export async function buildReport(
  db: HvemsClient,
  key: ReportKey,
  orgId: string,
  tz: string,
  f: ReportFilters,
  opts: { seesCosts: boolean },
): Promise<BuiltReport & { assets: Map<string, AssetInfo> }> {
  const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: tz }) : null);
  const dmy = (iso: string | null | undefined) => (iso ? (iso.length === 10 ? iso.split("-").reverse().join("/") : new Date(iso).toLocaleDateString("en-AU", { timeZone: tz })) : null);
  const dmyt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  // Push the date range down for timestamp columns (with a day's margin; exact filtering below).
  const range = (col: string) => ({
    dateColumn: col,
    from: f.from ? new Date(startOfDayInZone(f.from, tz).getTime() - 86400000).toISOString() : undefined,
    to: f.to ? new Date(startOfDayInZone(f.to, tz).getTime() + 2 * 86400000).toISOString() : undefined,
  });

  const [current, archived] = await Promise.all([
    listAssetsForExport(db, { organisationId: orgId, status: "current" }),
    listAssetsForExport(db, { organisationId: orgId, status: "archived" }),
  ]);
  const allAssets = [...current, ...archived];
  const assets = new Map<string, AssetInfo>(
    allAssets.map((a) => [
      a.id,
      {
        number: a.asset_number,
        make: a.make ?? "",
        model: a.model ?? "",
        cls: a.asset_class?.code ?? "",
        clsName: a.asset_class?.name ?? "",
        site: a.site?.id ?? "",
        siteName: a.site?.name ?? "",
        client: a.client?.id ?? "",
        clientName: a.client?.name ?? "",
      },
    ]),
  );
  const assetCells = (id: string | null) => {
    const a = id ? assets.get(id) : undefined;
    return [a?.number ?? null, a?.clsName ?? null, a?.siteName ?? null, a?.clientName ?? null];
  };
  const ASSET_COLS = ["Equipment ID", "Class", "Site", "Client"];

  const nameIds = new Set<string>();
  const want = (...ids: (string | null | undefined)[]) => ids.forEach((i) => i && nameIds.add(i));
  const names = async () => {
    const ids = [...nameIds];
    const m = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) for (const [k, v] of await getPersonNames(db, ids.slice(i, i + 200))) m.set(k, v);
    return (id: string | null | undefined) => (id ? (m.get(id) ?? "Former member") : null);
  };

  let columns: string[] = [];
  let rows: Row[] = [];
  let statuses: { value: string; label: string }[] = [];
  let money$ = false;
  const today = todayISO(tz);

  switch (key) {
    case "asset-register": {
      columns = [...ASSET_COLS, "Make", "Model", "Year", "Registration", "State", "VIN", "Serial number", "Owner type", "Odometer (km)", "Hour meter (hours)", "Condition", "Added", "Archived", "Archive reason"];
      statuses = [...Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label })), { value: "archived", label: "Archived" }];
      rows = allAssets.map((a) => {
        const status = a.archived_at ? "archived" : a.condition;
        return {
          day: dayOf(a.created_at),
          assetId: a.id,
          status,
          cells: [
            ...assetCells(a.id),
            a.make,
            a.model,
            a.year,
            a.registration_number,
            a.registration_state,
            a.vin,
            a.serial_number,
            OWNER_TYPE_LABELS[a.owner_type],
            num(a.current_odometer_km),
            num(a.current_engine_hours),
            a.archived_at ? "Archived" : CONDITION_LABELS[a.condition],
            dmy(a.created_at),
            dmy(a.archived_at),
            a.archive_reason,
          ],
        };
      });
      break;
    }
    case "condition-history": {
      type H = { asset_id: string; from_condition: keyof typeof CONDITION_LABELS; to_condition: keyof typeof CONDITION_LABELS; cause_kind: string | null; changed_by: string | null; changed_at: string };
      const list = await reportRows<H>(db, "asset_condition_history", "asset_id, from_condition, to_condition, cause_kind, changed_by, changed_at", orgId, { ...range("changed_at"), order: "changed_at" });
      list.forEach((h) => want(h.changed_by));
      const nm = await names();
      columns = ["Changed", ...ASSET_COLS, "From", "To", "Cause", "Changed by"];
      statuses = Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }));
      rows = list.map((h) => ({
        day: dayOf(h.changed_at),
        assetId: h.asset_id,
        status: h.to_condition,
        cells: [dmyt(h.changed_at), ...assetCells(h.asset_id), CONDITION_LABELS[h.from_condition], CONDITION_LABELS[h.to_condition], h.cause_kind?.replaceAll("_", " ") ?? null, nm(h.changed_by) ?? "System"],
      }));
      break;
    }
    case "inspections": {
      type I = { asset_id: string; result: keyof typeof INSPECTION_RESULT_LABELS; submitted_by: string; submitted_at: string; odometer_km: number | null; engine_hours: number | null; notes: string | null };
      type M = { asset_id: string; period_start: string; period_end: string; status: string; review_note: string | null; reviewed_by: string | null };
      const [done, missed] = await Promise.all([
        reportRows<I>(db, "inspections", "asset_id, result, submitted_by, submitted_at, odometer_km, engine_hours, notes", orgId, { ...range("submitted_at"), order: "submitted_at" }),
        reportRows<M>(db, "missed_prestarts", "asset_id, period_start, period_end, status, review_note, reviewed_by", orgId, { order: "period_start" }),
      ]);
      done.forEach((i) => want(i.submitted_by));
      missed.forEach((m) => want(m.reviewed_by));
      const nm = await names();
      columns = ["Date", ...ASSET_COLS, "Done or missed", "Result", "Operator or reviewer", "Odometer (km)", "Hour meter (hours)", "Notes"];
      statuses = [...Object.entries(INSPECTION_RESULT_LABELS).map(([value, label]) => ({ value, label })), ...Object.entries(MISSED).map(([value, label]) => ({ value: `missed_${value}`, label }))];
      rows = [
        ...done.map((i) => ({
          day: dayOf(i.submitted_at),
          assetId: i.asset_id,
          status: i.result,
          cells: [dmyt(i.submitted_at), ...assetCells(i.asset_id), "Done", INSPECTION_RESULT_LABELS[i.result], nm(i.submitted_by), num(i.odometer_km), num(i.engine_hours), i.notes],
        })),
        ...missed.map((m) => ({
          day: m.period_start,
          assetId: m.asset_id,
          status: `missed_${m.status}`,
          cells: [
            m.period_start === m.period_end ? dmy(m.period_start) : `${dmy(m.period_start)} – ${dmy(m.period_end)}`,
            ...assetCells(m.asset_id),
            "Missed",
            MISSED[m.status] ?? m.status,
            nm(m.reviewed_by),
            null,
            null,
            m.review_note,
          ],
        })),
      ].sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));
      break;
    }
    case "defects":
    case "deferred-defects": {
      type D = {
        id: string;
        asset_id: string;
        severity: keyof typeof DEFECT_SEVERITY_LABELS;
        status: keyof typeof DEFECT_STATUS_LABELS;
        title: string;
        issue_category: string | null;
        source: string;
        reported_by: string | null;
        reported_at: string;
        due_date: string | null;
        deferred_until: string | null;
        deferral_reason: string | null;
        deferred_by: string | null;
        deferred_at: string | null;
        closed_at: string | null;
        closed_by: string | null;
      };
      const list = await reportRows<D>(
        db,
        "defects",
        "id, asset_id, severity, status, title, issue_category, source, reported_by, reported_at, due_date, deferred_until, deferral_reason, deferred_by, deferred_at, closed_at, closed_by",
        orgId,
        { order: "reported_at" },
      );
      statuses = Object.entries(DEFECT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
      if (key === "defects") {
        list.forEach((d) => want(d.reported_by, d.closed_by));
        const nm = await names();
        columns = ["Reported", ...ASSET_COLS, "Defect", "Severity", "Kind of issue", "Source", "Status", "Repair due", "Closed", "Age (days)", "Reported by", "Closed by"];
        rows = list.map((d) => {
          const end = d.closed_at ? dayOf(d.closed_at)! : today;
          const age = Math.max(0, Math.round((Date.parse(end) - Date.parse(dayOf(d.reported_at)!)) / 86400000));
          return {
            day: dayOf(d.reported_at),
            assetId: d.asset_id,
            status: d.status,
            cells: [
              dmyt(d.reported_at),
              ...assetCells(d.asset_id),
              d.title,
              DEFECT_SEVERITY_LABELS[d.severity],
              issueCategoryLabel(d.issue_category) ?? "—",
              d.source === "operator_report" ? "Issue report" : "Pre-start",
              DEFECT_STATUS_LABELS[d.status],
              dmy(d.deferred_until ?? d.due_date),
              dmy(d.closed_at),
              age,
              nm(d.reported_by),
              nm(d.closed_by),
            ],
          };
        });
      } else {
        const deferred = list.filter((d) => d.deferred_until);
        deferred.forEach((d) => want(d.deferred_by));
        const nm = await names();
        columns = ["Deferred", ...ASSET_COLS, "Defect", "Severity", "Status", "Original repair due", "Deferred to", "Reason", "Approved by"];
        rows = deferred.map((d) => ({
          day: dayOf(d.deferred_at ?? d.reported_at),
          assetId: d.asset_id,
          status: d.status,
          cells: [dmyt(d.deferred_at), ...assetCells(d.asset_id), d.title, DEFECT_SEVERITY_LABELS[d.severity], DEFECT_STATUS_LABELS[d.status], dmy(d.due_date), dmy(d.deferred_until), d.deferral_reason, nm(d.deferred_by)],
        }));
      }
      break;
    }
    case "clearances": {
      type D = { asset_id: string; title: string; severity: keyof typeof DEFECT_SEVERITY_LABELS; closed_at: string; closed_by: string | null; repaired_by: string | null; resolution_note: string | null; evidence_paths: string[] };
      type R = { asset_id: string; returned_by: string; returned_at: string; note: string; evidence_paths: string[] };
      const [cleared, returns] = await Promise.all([
        reportRows<D>(db, "defects", "asset_id, title, severity, closed_at, closed_by, repaired_by, resolution_note, evidence_paths, status", orgId, { ...range("closed_at"), order: "closed_at" }).then((l) =>
          (l as (D & { status: string })[]).filter((d) => d.status === "repaired"),
        ),
        reportRows<R>(db, "return_to_service_events", "asset_id, returned_by, returned_at, note, evidence_paths", orgId, { ...range("returned_at"), order: "returned_at" }),
      ]);
      cleared.forEach((d) => want(d.closed_by, d.repaired_by));
      returns.forEach((r) => want(r.returned_by));
      const nm = await names();
      columns = ["Date", ...ASSET_COLS, "Decision", "Defect", "Severity", "Repaired by", "Decided by", "Details", "Evidence files"];
      rows = [
        ...cleared.map((d) => ({
          day: dayOf(d.closed_at),
          assetId: d.asset_id,
          status: null,
          cells: [dmyt(d.closed_at), ...assetCells(d.asset_id), "Defect cleared", d.title, DEFECT_SEVERITY_LABELS[d.severity], nm(d.repaired_by), nm(d.closed_by), d.resolution_note, d.evidence_paths?.length ?? 0],
        })),
        ...returns.map((r) => ({
          day: dayOf(r.returned_at),
          assetId: r.asset_id,
          status: null,
          cells: [dmyt(r.returned_at), ...assetCells(r.asset_id), "Returned to service", null, null, null, nm(r.returned_by), r.note, r.evidence_paths?.length ?? 0],
        })),
      ].sort((a, b) => String(b.cells[0] ?? "").localeCompare(String(a.cells[0] ?? "")));
      break;
    }
    case "services": {
      type P = { id: string; asset_id: string; name: string; next_due_on: string | null; next_due_km: number | null; next_due_hours: number | null; current_km: number | null; current_hours: number | null; last_done_on: string | null; status: string };
      type W = { number: number; asset_id: string; title: string; service_plan_id: string | null; closed_at: string | null; completed_by: string | null; odometer_km: number | null; engine_hours: number | null; status: string };
      const [plans, wos] = await Promise.all([
        reportRows<P>(db, "service_schedule", "id, asset_id, name, next_due_on, next_due_km, next_due_hours, current_km, current_hours, last_done_on, status", orgId, { order: "id" }),
        reportRows<W>(db, "work_orders", "number, asset_id, title, service_plan_id, closed_at, completed_by, odometer_km, engine_hours, status", orgId, { order: "created_at" }),
      ]);
      const done = wos.filter((w) => w.service_plan_id && w.status === "closed" && w.closed_at);
      const planName = new Map(plans.map((p) => [p.id, p.name]));
      done.forEach((w) => want(w.completed_by));
      const nm = await names();
      columns = ["Date", ...ASSET_COLS, "Row", "Service", "Status", "Due (km)", "Due (hours)", "Current (km)", "Current (hours)", "Last done", "Work order", "Done by"];
      statuses = [...Object.entries(SERVICE_STATUS).map(([value, label]) => ({ value, label })), { value: "done", label: "Done" }];
      rows = [
        ...plans.map((p) => ({
          day: p.next_due_on,
          assetId: p.asset_id,
          status: p.status,
          cells: [dmy(p.next_due_on), ...assetCells(p.asset_id), "Plan: next due", p.name, SERVICE_STATUS[p.status] ?? p.status, num(p.next_due_km), num(p.next_due_hours), num(p.current_km), num(p.current_hours), dmy(p.last_done_on), null, null],
        })),
        ...done.map((w) => ({
          day: dayOf(w.closed_at),
          assetId: w.asset_id,
          status: "done",
          cells: [dmy(w.closed_at), ...assetCells(w.asset_id), "Service done", planName.get(w.service_plan_id!) ?? w.title, "Done", null, null, num(w.odometer_km), num(w.engine_hours), null, `WO-${String(w.number).padStart(4, "0")}`, nm(w.completed_by)],
        })),
      ];
      break;
    }
    case "work-orders": {
      type W = {
        number: number;
        asset_id: string;
        title: string;
        kind: string;
        vendor_name: string | null;
        priority: string;
        status: string;
        assigned_to: string | null;
        completed_by: string | null;
        created_at: string;
        due_on: string | null;
        completed_at: string | null;
        closed_at: string | null;
        labour_hours: number | null;
        reopen_count: number;
      };
      const list = await reportRows<W>(
        db,
        "work_orders",
        "number, asset_id, title, kind, vendor_name, priority, status, assigned_to, completed_by, created_at, due_on, completed_at, closed_at, labour_hours, reopen_count",
        orgId,
        { ...range("created_at"), order: "created_at" },
      );
      list.forEach((w) => want(w.assigned_to, w.completed_by));
      const nm = await names();
      columns = ["Work order", "Created", ...ASSET_COLS, "Title", "Type", "Priority", "Status", "Assigned to", "Completed by", "Due", "Completed", "Closed", "Labour hours", "Days to complete", "Times reopened"];
      statuses = Object.entries(WO_STATUS).map(([value, label]) => ({ value, label }));
      rows = list.map((w) => ({
        day: dayOf(w.created_at),
        assetId: w.asset_id,
        status: w.status,
        cells: [
          `WO-${String(w.number).padStart(4, "0")}`,
          dmyt(w.created_at),
          ...assetCells(w.asset_id),
          w.title,
          w.kind === "vendor" ? `Vendor: ${w.vendor_name ?? ""}` : "Internal",
          w.priority,
          WO_STATUS[w.status] ?? w.status,
          nm(w.assigned_to),
          nm(w.completed_by),
          dmy(w.due_on),
          dmy(w.completed_at),
          dmy(w.closed_at),
          num(w.labour_hours),
          w.completed_at ? Math.max(0, Math.round((Date.parse(dayOf(w.completed_at)!) - Date.parse(dayOf(w.created_at)!)) / 86400000)) : null,
          w.reopen_count,
        ],
      }));
      break;
    }
    case "maintenance-cost": {
      type C = { kind: string; asset_id: string | null; work_order_id: string | null; description: string; amount_cents: number; gst_included: boolean; reverses_id: string | null; created_at: string; work_order: { number: number; title: string } | null };
      const list = opts.seesCosts
        ? await reportRows<C>(db, "cost_lines", "kind, asset_id, work_order_id, description, amount_cents, gst_included, reverses_id, created_at, work_order:work_orders(number, title)", orgId, {
            ...range("created_at"),
            order: "created_at",
          })
        : [];
      money$ = true;
      columns = ["Posted", ...ASSET_COLS, "Type", "Work order", "Description", "Amount (AUD)", "GST", "Reversal"];
      statuses = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));
      rows = list.map((c) => ({
        day: dayOf(c.created_at),
        assetId: c.asset_id,
        status: c.kind,
        amount: c.amount_cents,
        cells: [
          dmyt(c.created_at),
          ...assetCells(c.asset_id),
          KIND_LABELS[c.kind] ?? c.kind,
          c.work_order ? `WO-${String(c.work_order.number).padStart(4, "0")} ${c.work_order.title}` : null,
          c.description,
          money(c.amount_cents),
          c.gst_included ? "Included" : "Excluded",
          c.reverses_id ? "Yes" : "",
        ],
      }));
      break;
    }
    case "parts": {
      type L = {
        id: string;
        description: string;
        part_number: string | null;
        quantity: number;
        received_qty: number;
        returned_to_supplier_qty: number;
        fitted_qty: number;
        ordered_on: string | null;
        expected_on: string | null;
        order_ref: string | null;
        removed_at: string | null;
        request: { number: number; status: string; urgency: string; asset_id: string; created_at: string; requested_by: string; decided_by: string | null } | null;
        supplier: { name: string } | null;
      };
      type Pr = { line_id: string; approved_unit_cost_cents: number | null; actual_unit_cost_cents: number | null };
      const [lines, prices] = await Promise.all([
        reportRows<L>(
          db,
          "parts_request_lines",
          "id, description, part_number, quantity, received_qty, returned_to_supplier_qty, fitted_qty, ordered_on, expected_on, order_ref, removed_at, request:parts_requests(number, status, urgency, asset_id, created_at, requested_by, decided_by), supplier:suppliers!parts_request_lines_supplier_id_organisation_id_fkey(name)",
          orgId,
          { order: "id" },
        ),
        opts.seesCosts ? reportRows<Pr>(db, "parts_line_prices", "line_id, approved_unit_cost_cents, actual_unit_cost_cents", orgId, { order: "line_id" }).catch(() => []) : Promise.resolve([] as Pr[]),
      ]);
      const priceOf = new Map(prices.map((p) => [p.line_id, p]));
      const live = lines.filter((l) => !l.removed_at && l.request);
      live.forEach((l) => want(l.request?.requested_by, l.request?.decided_by));
      const nm = await names();
      columns = [
        "Request",
        "Requested",
        ...ASSET_COLS,
        "Part",
        "Part number",
        "Urgency",
        "Status",
        "Quantity",
        "Received",
        "Outstanding",
        "Returned to supplier",
        "Fitted",
        "Supplier",
        "Order reference",
        "Ordered",
        "Expected",
        "Requested by",
        "Approved by",
        ...(opts.seesCosts ? ["Approved unit price (AUD)", "Actual unit price (AUD)"] : []),
      ];
      statuses = Object.entries(PARTS_STATUS).map(([value, s]) => ({ value, label: s.label }));
      rows = live
        .sort((a, b) => b.request!.created_at.localeCompare(a.request!.created_at))
        .map((l) => {
          const r = l.request!;
          const p = priceOf.get(l.id);
          return {
            day: dayOf(r.created_at),
            assetId: r.asset_id,
            status: r.status,
            cells: [
              formatPartsRequestNumber(r.number),
              dmy(r.created_at),
              ...assetCells(r.asset_id),
              l.description,
              l.part_number,
              r.urgency === "urgent" ? "Urgent" : "Normal",
              PARTS_STATUS[r.status as keyof typeof PARTS_STATUS]?.label ?? r.status,
              num(l.quantity),
              num(l.received_qty),
              Math.max(0, Number(l.quantity) - Number(l.received_qty)),
              num(l.returned_to_supplier_qty),
              num(l.fitted_qty),
              l.supplier?.name ?? null,
              l.order_ref,
              dmy(l.ordered_on),
              dmy(l.expected_on),
              nm(r.requested_by),
              nm(r.decided_by),
              ...(opts.seesCosts ? [money(p?.approved_unit_cost_cents), money(p?.actual_unit_cost_cents)] : []),
            ],
          };
        });
      break;
    }
    case "fuel": {
      type F = { id: string; asset_id: string; filled_at: string; fuel_type: keyof typeof FUEL_TYPES; quantity: number; unit: string; odometer_km: number | null; engine_hours: number | null; supplier: string | null; receipt_paths: string[]; recorded_by: string; amend_reason: string | null };
      type C = { source_id: string; amount_cents: number; reverses_id: string | null };
      const [list, costs] = await Promise.all([
        reportRows<F & { superseded_at: string | null }>(
          db,
          "fuel_records",
          "id, asset_id, filled_at, fuel_type, quantity, unit, odometer_km, engine_hours, supplier, receipt_paths, recorded_by, amend_reason, superseded_at",
          orgId,
          { ...range("filled_at"), order: "filled_at" },
        ).then((l) => l.filter((r) => !r.superseded_at)),
        opts.seesCosts ? reportRows<C & { source_type: string }>(db, "cost_lines", "source_type, source_id, amount_cents, reverses_id", orgId, { order: "created_at" }) : Promise.resolve([]),
      ]);
      const costOf = new Map(costs.filter((c) => c.source_type === "fuel_record" && !c.reverses_id).map((c) => [c.source_id, c.amount_cents]));
      list.forEach((r) => want(r.recorded_by));
      const nm = await names();
      money$ = opts.seesCosts;
      columns = ["Filled", ...ASSET_COLS, "Fuel", "Quantity", "Unit", "Odometer (km)", "Hour meter (hours)", "Supplier", "Receipts", "Recorded by", "Correction reason", ...(opts.seesCosts ? ["Cost (AUD)"] : [])];
      rows = list.map((r) => ({
        day: dayOf(r.filled_at),
        assetId: r.asset_id,
        status: null,
        amount: costOf.get(r.id) ?? 0,
        cells: [
          dmyt(r.filled_at),
          ...assetCells(r.asset_id),
          FUEL_TYPES[r.fuel_type] ?? r.fuel_type,
          num(r.quantity),
          r.unit === "L" ? "litres" : r.unit,
          num(r.odometer_km),
          num(r.engine_hours),
          r.supplier,
          r.receipt_paths?.length ?? 0,
          nm(r.recorded_by),
          r.amend_reason,
          ...(opts.seesCosts ? [money(costOf.get(r.id))] : []),
        ],
      }));
      break;
    }
    case "notices": {
      type N = { asset_id: string; authority: string; notice_number: string | null; severity: string; issued_on: string; clear_by: string | null; details: string; status: string; cleared_on: string | null; clearance_reference: string | null; recorded_by: string | null; cleared_by: string | null };
      const list = await reportRows<N>(db, "regulator_notices", "asset_id, authority, notice_number, severity, issued_on, clear_by, details, status, cleared_on, clearance_reference, recorded_by, cleared_by", orgId, {
        order: "issued_on",
      });
      list.forEach((n) => want(n.recorded_by, n.cleared_by));
      const nm = await names();
      columns = ["Issued", ...ASSET_COLS, "Authority", "Notice number", "Severity", "Details", "Clear by", "Status", "Cleared", "Clearance reference", "Recorded by", "Cleared by"];
      statuses = [
        { value: "open", label: "Open" },
        { value: "cleared", label: "Cleared" },
      ];
      rows = list.map((n) => ({
        day: n.issued_on,
        assetId: n.asset_id,
        status: n.status,
        cells: [dmy(n.issued_on), ...assetCells(n.asset_id), n.authority, n.notice_number, NOTICE_SEVERITY[n.severity] ?? n.severity, n.details, dmy(n.clear_by), n.status === "open" ? "Open" : "Cleared", dmy(n.cleared_on), n.clearance_reference, nm(n.recorded_by), nm(n.cleared_by)],
      }));
      break;
    }
    case "marketplace": {
      type J = { id: string; number: number; title: string; category: string; urgency: string; status: keyof typeof JOB_STATUS; asset_id: string | null; suburb: string; posted_at: string; closes_at: string };
      type P = { job_id: string; provider_id: string; status: string; submitted_at: string };
      type E = { job_id: string; provider_id: string; status: string; number: number; poster_fee_cents: number; fee_status: string; accepted_at: string };
      const [jobs, props, engs, quoted, quotedJobs] = await Promise.all([
        reportRows<J>(db, "marketplace_jobs", "id, number, title, category, urgency, status, asset_id, suburb, posted_at, closes_at", orgId, { order: "posted_at" }),
        reportRows<P>(db, "marketplace_proposals", "job_id, provider_id, status, submitted_at", orgId, { order: "submitted_at" }).catch(() => [] as P[]),
        reportRows<E>(db, "marketplace_engagements", "job_id, provider_id, status, number, poster_fee_cents, fee_status, accepted_at", orgId, { order: "accepted_at" }).catch(() => [] as E[]),
        listMyProposals(db, orgId).catch(() => []),
        browseMarketplaceJobs(db, orgId, { mine: true }).catch(() => []),
      ]);
      // Proposals on our jobs aren't filtered by organisation (they belong to providers), so read them per job.
      const onJobs = jobs.length
        ? ((await db.from("marketplace_proposals" as never).select("job_id, provider_id, status, submitted_at").in("job_id", jobs.map((j) => j.id))).data as P[] | null) ?? []
        : props;
      const names = new Map<string, string>();
      for (const j of jobs.filter((x) => onJobs.some((p) => p.job_id === x.id))) {
        const { data } = await db.rpc("marketplace_thread_providers" as never, { p_job_id: j.id } as never);
        for (const p of ((data as unknown as { id: string; name: string }[] | null) ?? [])) names.set(p.id, p.name);
      }
      const jobOf = new Map(quotedJobs.map((j) => [j.id, j]));
      money$ = true;
      columns = ["Side", "Date", "Job", "Title", "Service", "Urgency", "Equipment", "Suburb", "Job status", "Proposals", "First proposal (minutes)", "Provider", "Price", "Proposal or engagement", "Connection fee (AUD)", "Fee status"];
      statuses = [
        { value: "posted", label: "Jobs we posted" },
        { value: "quoted", label: "Jobs we quoted on" },
      ];
      rows = [
        ...jobs.map((j) => {
          const ps = onJobs.filter((p) => p.job_id === j.id);
          const first = ps.map((p) => Date.parse(p.submitted_at)).sort((a, b) => a - b)[0];
          const e = engs.filter((x) => x.job_id === j.id).sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0];
          const a = j.asset_id ? assets.get(j.asset_id) : undefined;
          return {
            day: dayOf(j.posted_at),
            assetId: j.asset_id,
            status: "posted",
            amount: e && e.status !== "cancelled" ? e.poster_fee_cents : 0,
            cells: [
              "Posted",
              dmyt(j.posted_at),
              `Job ${j.number}`,
              j.title,
              PROVIDER_CATEGORIES[j.category as keyof typeof PROVIDER_CATEGORIES] ?? j.category,
              j.urgency === "urgent" ? "Urgent" : "Standard",
              a?.number ?? null,
              j.suburb,
              JOB_STATUS[j.status]?.label ?? j.status,
              ps.length,
              first ? Math.round((first - Date.parse(j.posted_at)) / 60000) : null,
              e ? (names.get(e.provider_id) ?? "Provider") : null,
              null,
              e ? `Engagement ${e.number}: ${ENGAGEMENT_STATUS[e.status]?.label ?? e.status}` : null,
              e && e.status !== "cancelled" ? money(e.poster_fee_cents) : null,
              e ? (e.fee_status === "not_live" ? "Recorded, not charged" : e.fee_status.replaceAll("_", " ")) : null,
            ],
          };
        }),
        ...quoted.map((p) => {
          const j = jobOf.get(p.job_id);
          return {
            day: dayOf(p.submitted_at),
            assetId: null,
            status: "quoted",
            amount: 0,
            cells: [
              "Quoted",
              dmyt(p.submitted_at),
              j ? `Job ${j.number}` : null,
              j?.title ?? null,
              j ? (PROVIDER_CATEGORIES[j.category] ?? j.category) : null,
              j ? (j.urgency === "urgent" ? "Urgent" : "Standard") : null,
              null,
              j?.suburb ?? null,
              j ? (JOB_STATUS[j.status]?.label ?? j.status) : null,
              null,
              null,
              null,
              p.current ? priceText(p.current) : null,
              `Proposal: ${PROPOSAL_STATUS[p.status]?.label ?? p.status}${p.version > 1 ? ` (v${p.version})` : ""}`,
              p.current ? money(p.current.fee_cents) : null,
              p.status === "accepted" ? "Recorded, not charged" : null,
            ],
          };
        }),
      ].sort((x, y) => (y.day ?? "").localeCompare(x.day ?? ""));
      break;
    }
    default:
      return { columns: [], rows: [], totals: [], statuses: [], truncated: false, assets };
  }

  const shown = rows.filter((r) => {
    const a = r.assetId ? assets.get(r.assetId) : undefined;
    return (
      (!f.from || (r.day !== null && r.day >= f.from)) &&
      (!f.to || (r.day !== null && r.day <= f.to)) &&
      (!f.asset || r.assetId === f.asset) &&
      (!f.site || a?.site === f.site) &&
      (!f.client || a?.client === f.client) &&
      (!f.class || a?.cls === f.class) &&
      (!f.status || r.status === f.status)
    );
  });
  const totals = [{ label: "Rows", value: shown.length.toLocaleString("en-AU") }];
  if (money$) {
    const sum = shown.reduce((s, r) => s + (r.amount ?? 0), 0);
    totals.push({ label: "Total (AUD)", value: (sum / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" }) });
  }
  return { columns, rows: shown.map((r) => r.cells), totals, statuses, truncated: rows.length >= REPORT_ROW_LIMIT, assets };
}
