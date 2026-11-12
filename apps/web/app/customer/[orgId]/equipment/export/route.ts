import { notFound } from "next/navigation";
import { getPersonNames, listAssetsForExport } from "@hvems/api-client";
import { CONDITION_LABELS, METER_TYPE_LABELS, OWNER_TYPE_LABELS, prestartFrequencyText, toCsv, type AssetCondition } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CONDITIONS = ["active", "needs_attention", "out_of_service"] as const;
const dmy = (iso: string | null | undefined, tz: string) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }) : "";

/** CSV of the equipment register with the page's filters (tab and search). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "assets.view") && !can(ctx.capabilities, "assets.view_permitted")) notFound();
  const sp = new URL(request.url).searchParams;
  const condition = CONDITIONS.find((c) => c === sp.get("condition")) as AssetCondition | undefined;
  const archived = sp.get("status") === "archived";

  const db = await createSupabaseServerClient();
  const rows = await listAssetsForExport(db, { organisationId: orgId, condition, status: archived ? "archived" : "current", search: sp.get("q") ?? undefined });
  const ids = [...new Set(rows.map((r) => r.current_operator_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) for (const [k, v] of await getPersonNames(db, ids.slice(i, i + 200))) names.set(k, v);

  const tz = ctx.timezone;
  const csv = toCsv([
    [
      "Equipment ID", "Class", "Make", "Model", "Year", "Registration", "State", "VIN", "Serial number",
      "Owner type", "Client", "Site", "Odometer / hour meter", "Odometer (km)", "Odometer read", "Hour meter (h)", "Hour meter read",
      "Condition", "Current operator", "Pre-start checks", "Notes", "Archived", "Archive reason",
    ],
    ...rows.map((a) => [
      a.asset_number,
      a.asset_class?.name,
      a.make,
      a.model,
      a.year,
      a.registration_number,
      a.registration_state,
      a.vin,
      a.serial_number,
      OWNER_TYPE_LABELS[a.owner_type],
      a.client?.name,
      a.site?.name,
      METER_TYPE_LABELS[a.meter_type],
      a.current_odometer_km,
      dmy(a.odometer_read_at, tz),
      a.current_engine_hours,
      dmy(a.engine_hours_read_at, tz),
      a.archived_at ? "Archived" : CONDITION_LABELS[a.condition],
      a.current_operator_id ? (names.get(a.current_operator_id) ?? "Former operator") : "",
      prestartFrequencyText(a.prestart_frequency, a.prestart_every_days) ?? "As per type",
      a.notes,
      dmy(a.archived_at, tz),
      a.archive_reason,
    ]),
  ]);
  const name = `hvems-equipment${archived ? "-archived" : condition ? `-${condition.replaceAll("_", "-")}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
