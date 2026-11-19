import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonNames, listAssetsForExport, listExpenditure, listFuelRecords, signInspectionPhotos } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FuelDialog, type FuelEquipment } from "@/features/fuel/fuel-dialog";
import { FUEL_TYPES, type FuelTypeKey } from "@/features/fuel/types";
import { aud } from "@/features/parts/status";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Fuel & Usage" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 2 });

/** Local yyyy-mm-ddThh:mm in the business timezone, for the correction form. */
function localInput(iso: string, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Fuel and usage records (CS-23, EXP-02): every fill, its reading, receipt and (for cost readers) cost. */
export default async function FuelPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const canRecord = can(ctx.capabilities, "meter_readings.record");
  const canCorrect = can(ctx.capabilities, "meter_readings.accept");
  const seesCost = can(ctx.capabilities, "assets.costs.view");
  if (!canRecord && !seesCost) notFound();
  const db = await createSupabaseServerClient();
  const [records, assets, costs] = await Promise.all([
    listFuelRecords(db, { organisationId: orgId }),
    canRecord ? listAssetsForExport(db, { organisationId: orgId }) : Promise.resolve([]),
    seesCost ? listExpenditure(db, orgId) : Promise.resolve([]),
  ]);
  const costOf = new Map(costs.filter((c) => c.source_type === "fuel_record" && !c.reverses_id).map((c) => [c.source_id, c.amount_cents]));
  const [names, receipts] = await Promise.all([
    getPersonNames(db, [...new Set(records.map((r) => r.recorded_by))]),
    signInspectionPhotos(db, records.flatMap((r) => r.receipt_paths)),
  ]);

  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase().slice(0, 60),
    asset: firstParam(sp.asset) ?? "",
    type: firstParam(sp.type) ?? "",
    from: ISO.test(firstParam(sp.from) ?? "") ? firstParam(sp.from)! : "",
    to: ISO.test(firstParam(sp.to) ?? "") ? firstParam(sp.to)! : "",
  };
  const rows = records.filter((r) => {
    const day = new Date(r.filled_at).toLocaleDateString("en-CA", { timeZone: ctx.timezone });
    return (
      (!f.q || [r.asset?.asset_number, r.asset?.make, r.asset?.model, r.supplier, r.notes, names.get(r.recorded_by)].some((x) => (x ?? "").toLowerCase().includes(f.q))) &&
      (!f.asset || r.asset_id === f.asset) &&
      (!f.type || r.fuel_type === f.type) &&
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to)
    );
  });
  const litres = rows.filter((r) => r.unit === "L").reduce((s, r) => s + Number(r.quantity), 0);
  const spend = rows.reduce((s, r) => s + (costOf.get(r.id) ?? 0), 0);

  const equipment: FuelEquipment[] = assets
    .filter((a) => !a.archived_at)
    .map((a) => ({
      value: a.id,
      label: [a.asset_number, a.make, a.model].filter(Boolean).join(" · "),
      meterType: a.meter_type as FuelEquipment["meterType"],
      lastKm: a.current_odometer_km === null ? null : Number(a.current_odometer_km),
      lastHours: a.current_engine_hours === null ? null : Number(a.current_engine_hours),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const equipmentFilter = [...new Map(records.map((r) => [r.asset_id, r.asset?.asset_number ?? "—"])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const base = `/customer/${orgId}/fuel`;

  return (
    <>
      <PageHeader
        title="Fuel & Usage"
        description="Every fill with its odometer or hour meter reading and receipt. Corrections keep the original."
        actions={canRecord ? <FuelDialog orgId={orgId} equipment={equipment} showCost={seesCost} /> : null}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-[12.5px] text-ink-muted">Fills shown</p>
          <p className="text-[22px] font-semibold text-ink">{rows.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[12.5px] text-ink-muted">Litres</p>
          <p className="text-[22px] font-semibold text-ink">{num(litres)}</p>
        </Card>
        {seesCost ? (
          <Card className="px-4 py-3">
            <p className="text-[12.5px] text-ink-muted">Fuel spend</p>
            <p className="text-[22px] font-semibold text-ink">{aud(spend)}</p>
          </Card>
        ) : null}
      </div>
      <Card>
        <FilterBar
          action={base}
          search={{ value: f.q, placeholder: "Equipment, supplier or person" }}
          fields={[
            { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipmentFilter },
            {
              kind: "select",
              name: "type",
              label: "Fuel",
              all: "Any fuel",
              value: f.type,
              options: (Object.keys(FUEL_TYPES) as FuelTypeKey[]).map((k) => ({ value: k, label: FUEL_TYPES[k] })),
            },
            { kind: "date", name: "from", label: "From", value: f.from },
            { kind: "date", name: "to", label: "To", value: f.to },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={records.length ? "No fuel records match" : "No fuel recorded yet"}>
            {records.length ? "Try a different search or filter." : canRecord ? "Use Record fuel after each fill." : null}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Equipment</TH>
                <TH>Fuel</TH>
                <TH>Reading</TH>
                <TH>Supplier</TH>
                {seesCost ? <TH>Cost</TH> : null}
                <TH>Recorded by</TH>
                {canCorrect ? <TH className="w-12" /> : null}
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(r.filled_at), ctx.timezone)}</TD>
                  <TD>
                    <Link href={`/customer/${orgId}/equipment/${r.asset_id}`} className="relative z-10 font-medium text-link hover:underline">
                      {r.asset?.asset_number}
                    </Link>
                    <span className="block text-[12.5px] text-ink-muted">{[r.asset?.make, r.asset?.model].filter(Boolean).join(" ")}</span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {num(Number(r.quantity))} {r.unit === "L" ? "L" : r.unit} {FUEL_TYPES[r.fuel_type]}
                    {r.amends_id ? <span className="block text-[12px] text-ink-subtle">Corrected: {r.amend_reason}</span> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-ink-muted">
                    {[r.odometer_km != null ? `${num(Number(r.odometer_km))} km` : null, r.engine_hours != null ? `${num(Number(r.engine_hours))} h` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TD>
                  <TD className="max-w-[200px]">
                    <span className="block truncate">{r.supplier ?? "—"}</span>
                    {r.receipt_paths.map((p, i) =>
                      receipts[p] ? (
                        <a key={p} href={receipts[p]} target="_blank" rel="noreferrer" className="relative z-10 mr-2 text-[12.5px] text-link hover:underline">
                          Receipt{r.receipt_paths.length > 1 ? ` ${i + 1}` : ""}
                        </a>
                      ) : null,
                    )}
                  </TD>
                  {seesCost ? <TD className="whitespace-nowrap">{aud(costOf.get(r.id))}</TD> : null}
                  <TD className="text-[13px] text-ink-muted">{names.get(r.recorded_by) ?? "Former member"}</TD>
                  {canCorrect ? (
                    <TD>
                      <FuelDialog
                        orgId={orgId}
                        equipment={equipment}
                        showCost={seesCost}
                        amend={{
                          id: r.id,
                          assetId: r.asset_id,
                          filledAt: localInput(r.filled_at, ctx.timezone),
                          fuelType: r.fuel_type,
                          quantity: Number(r.quantity),
                          unit: r.unit,
                          supplier: r.supplier,
                          notes: r.notes,
                        }}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
