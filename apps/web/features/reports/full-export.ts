import "server-only";
import { strToU8, zipSync } from "fflate";
import { REPORT_ROW_LIMIT, reportRows, type HvemsClient } from "@hvems/api-client";
import { toCsv } from "@hvems/domain";

/** Every type of company record, one CSV each (SoW 3.8 full export). Read under the person's own permissions. */
const TABLES: { table: string; file: string; order?: string }[] = [
  { table: "assets", file: "equipment" },
  { table: "clients", file: "clients" },
  { table: "sites", file: "sites" },
  { table: "asset_operator_permissions", file: "operator-permissions" },
  { table: "meter_readings", file: "odometer-and-hour-meter-readings" },
  { table: "asset_condition_history", file: "condition-history" },
  { table: "inspections", file: "pre-start-inspections" },
  { table: "inspection_answers", file: "pre-start-answers" },
  { table: "inspection_photos", file: "pre-start-photos" },
  { table: "missed_prestarts", file: "missed-pre-starts" },
  { table: "defects", file: "defects" },
  { table: "holds", file: "holds" },
  { table: "breakdowns", file: "breakdowns" },
  { table: "regulator_notices", file: "regulator-notices" },
  { table: "return_to_service_events", file: "return-to-service" },
  { table: "service_plans", file: "service-plans" },
  { table: "service_plan_due_history", file: "service-due-history" },
  { table: "work_orders", file: "work-orders" },
  { table: "work_order_reports", file: "work-order-reports" },
  { table: "work_order_files", file: "work-order-files" },
  { table: "suppliers", file: "suppliers" },
  { table: "parts_catalogue", file: "parts-catalogue" },
  { table: "parts_requests", file: "parts-requests" },
  { table: "parts_request_lines", file: "parts-request-lines" },
  { table: "parts_receipts", file: "parts-receipts" },
  { table: "parts_usage", file: "parts-usage" },
  { table: "fuel_records", file: "fuel-records" },
  { table: "cost_lines", file: "cost-lines" },
  { table: "documents", file: "documents" },
  { table: "workforce_profiles", file: "technician-profiles", order: "user_id" },
  { table: "workforce_qualifications", file: "technician-qualifications" },
  { table: "workforce_leave", file: "technician-leave" },
  { table: "driver_profiles", file: "operator-profiles" },
  { table: "driver_credentials", file: "operator-credentials" },
];

function objectsToCsv(rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return toCsv([
    cols,
    ...rows.map((r) =>
      cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return v;
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      }),
    ),
  ]);
}

/** Builds the zip: one CSV per record type, the audit history when permitted, a file list and a README. */
export async function buildFullExport(
  db: HvemsClient,
  orgId: string,
  info: { company: string; generated: string; includeAudit: boolean },
): Promise<{ zip: Uint8Array; rows: number }> {
  const files: Record<string, Uint8Array> = {};
  const notes: string[] = [];
  let total = 0;
  const results = await Promise.all(
    TABLES.map(async (t) => {
      try {
        return { t, rows: await reportRows<Record<string, unknown>>(db, t.table, "*", orgId, { order: t.order ?? "id" }) };
      } catch {
        return { t, rows: null };
      }
    }),
  );
  const manifest: (string | number | null)[][] = [["Record type", "File", "Storage bucket", "Path"]];
  for (const { t, rows } of results) {
    if (rows === null) {
      notes.push(`- ${t.file}: not included (your role can't read these records).`);
      continue;
    }
    total += rows.length;
    files[`${t.file}.csv`] = strToU8("﻿" + objectsToCsv(rows));
    if (rows.length >= REPORT_ROW_LIMIT) notes.push(`- ${t.file}: first ${REPORT_ROW_LIMIT.toLocaleString("en-AU")} rows only.`);
    // Original files referenced by these records.
    for (const r of rows) {
      const add = (bucket: string, p: unknown) => typeof p === "string" && p && manifest.push([t.file, String(r.file_name ?? r.title ?? ""), bucket, p]);
      if (t.table === "documents") add("documents", r.path);
      if (t.table === "work_order_files") add("work-order-files", r.path);
      if (t.table === "inspection_photos") add("inspection-photos", r.storage_path);
      for (const k of ["evidence_paths", "receipt_paths", "photo_paths"]) if (Array.isArray(r[k])) for (const p of r[k] as unknown[]) add("inspection-photos", p);
    }
  }
  if (info.includeAudit) {
    try {
      const audit = await reportRows<Record<string, unknown>>(db, "audit_events", "*", orgId, { order: "occurred_at" });
      total += audit.length;
      files["audit-history.csv"] = strToU8("﻿" + objectsToCsv(audit));
      if (audit.length >= REPORT_ROW_LIMIT) notes.push(`- audit-history: latest ${REPORT_ROW_LIMIT.toLocaleString("en-AU")} events only (use Audit History to export by date).`);
    } catch {
      notes.push("- audit-history: not included.");
    }
  }
  files["original-files.csv"] = strToU8("﻿" + toCsv(manifest));
  files["README.txt"] = strToU8(
    [
      `HVEMS full export for ${info.company}`,
      info.generated,
      "",
      "One CSV per type of record. Dates and times are in UTC (ISO 8601); amounts ending _cents are whole cents (AUD).",
      "original-files.csv lists every stored file (documents, photos, receipts, invoices) with its storage location;",
      "the files themselves are not inside this zip yet.",
      ...(notes.length ? ["", "Notes:", ...notes] : []),
      "",
    ].join("\r\n"),
  );
  return { zip: zipSync(files, { level: 6 }), rows: total };
}
