import "server-only";
import { strToU8, zipSync, type Zippable } from "fflate";
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
  { table: "marketplace_jobs", file: "marketplace-jobs" },
  { table: "marketplace_job_files", file: "marketplace-job-files" },
  { table: "marketplace_engagements", file: "marketplace-engagements" },
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

const FILE_BUDGET_BYTES = 150 * 1024 * 1024;

/** Builds the zip: one CSV per record type, the audit history when permitted, a file list and a README. */
export async function buildFullExport(
  db: HvemsClient,
  orgId: string,
  info: { company: string; generated: string; includeAudit: boolean },
): Promise<{ zip: Uint8Array; rows: number }> {
  const files: Zippable = {};
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
  const manifest: (string | number | null)[][] = [["Record type", "File", "Storage bucket", "Path", "In this zip"]];
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
      if (t.table === "marketplace_job_files") add("marketplace-files", r.path);
      if (t.table === "marketplace_engagements" && Array.isArray(r.completion_paths)) for (const p of r.completion_paths as unknown[]) add("marketplace-files", p);
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
  // Original files, read with the person's own access, up to the size budget (RPT-05: larger exports need the background job).
  let used = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of manifest.slice(1)) {
    const bucket = String(row[2]);
    const path = String(row[3]);
    const key = `files/${bucket}/${path}`;
    if (seen.has(key)) {
      row[4] = "yes";
      continue;
    }
    seen.add(key);
    if (used >= FILE_BUDGET_BYTES) {
      row[4] = "no (size limit)";
      skipped++;
      continue;
    }
    const { data } = await db.storage.from(bucket).download(path);
    if (!data) {
      row[4] = "no (not readable)";
      skipped++;
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (used + bytes.length > FILE_BUDGET_BYTES) {
      row[4] = "no (size limit)";
      skipped++;
      continue;
    }
    used += bytes.length;
    // Photos and PDFs are already compressed: store them as they are.
    files[key] = [bytes, { level: 0 }];
    row[4] = "yes";
  }
  if (skipped) notes.push(`- ${skipped} stored file(s) are listed in original-files.csv but not included (over the ${FILE_BUDGET_BYTES / 1048576} MB limit for one download, or not readable with your access).`);
  files["original-files.csv"] = strToU8("﻿" + toCsv(manifest));
  files["README.txt"] = strToU8(
    [
      `HVEMS full export for ${info.company}`,
      info.generated,
      "",
      "One CSV per type of record. Dates and times are in UTC (ISO 8601); amounts ending _cents are whole cents (AUD).",
      "Stored files (documents, photos, receipts, invoices) are in the files/ folder, by storage bucket and path.",
      "original-files.csv lists every one and whether it is in this zip.",
      ...(notes.length ? ["", "Notes:", ...notes] : []),
      "",
    ].join("\r\n"),
  );
  return { zip: zipSync(files, { level: 6 }), rows: total };
}
