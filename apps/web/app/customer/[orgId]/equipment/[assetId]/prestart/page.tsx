import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAsset, getPrestartChecklist, listDefects } from "@hvems/api-client";
import { DEFECT_SEVERITY_LABELS, formatDateTimeAU } from "@hvems/domain";
import { ConditionBadge } from "@/components/condition";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { PrestartForm } from "./prestart-form";

export const metadata: Metadata = { title: "Pre-start" };

function nowLabel(timeZone: string) {
  return formatDateTimeAU(new Date(), timeZone);
}

/**
 * Pre-start (P-01 draft content). The header is filled from the equipment
 * record and can't be edited; the database builds the checklist for the
 * equipment's class and re-checks every answer on submit.
 */
export default async function PrestartPage({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "inspections.submit");
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  const [checklist, openDefects] = await Promise.all([
    getPrestartChecklist(db, assetId).catch(() => null),
    listDefects(db, { organisationId: orgId, assetId, status: "open" }),
  ]);
  if (!checklist) notFound();

  const tz = ctx.timezone;
  const reading = (value: number | null, unit: string, at: string | null) =>
    value === null ? "No reading yet" : `${formatNumber(value)} ${unit}${at ? ` · ${formatDateTimeAU(new Date(at), tz)}` : ""}`;
  const tracksKm = asset.meter_type === "kilometres" || asset.meter_type === "both";
  const tracksHours = asset.meter_type === "hours" || asset.meter_type === "both";
  const base = `/customer/${orgId}/equipment/${assetId}`;

  return (
    <>
      <PageHeader
        title={`Pre-start · ${asset.asset_number}`}
        description="Check the equipment before you use it. A fault always needs a note; a photo is recommended."
        breadcrumb={{ label: asset.asset_number, href: base }}
      />
      <Card className="mb-5">
        <CardHeader title="Equipment" description="Filled in from the equipment record" action={<ConditionBadge condition={asset.condition} />} />
        <CardBody>
          <Dl
            className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            items={[
              { label: "Equipment ID", value: asset.asset_number },
              { label: "Class", value: asset.asset_class?.name ?? "—" },
              { label: "Make / Model", value: [asset.make, asset.model].filter(Boolean).join(" ") || "—" },
              { label: "Year", value: asset.year ?? "—" },
              { label: "Rego", value: asset.registration_number ? `${asset.registration_number} ${asset.registration_state ?? ""}`.trim() : "—" },
              { label: "VIN / Serial", value: asset.vin ?? asset.serial_number ?? "—" },
              { label: "Site", value: asset.site?.name ?? "—" },
              { label: "Client", value: asset.client?.name ?? "—" },
              ...(tracksKm ? [{ label: "Last odometer", value: reading(asset.current_odometer_km, "km", asset.odometer_read_at) }] : []),
              ...(tracksHours ? [{ label: "Last hours", value: reading(asset.current_engine_hours, "h", asset.engine_hours_read_at) }] : []),
              { label: "Operator", value: ctx.user.fullName || ctx.user.email },
              { label: "Date", value: nowLabel(tz) },
            ]}
          />
          {openDefects.length > 0 ? (
            <div className="mt-4 rounded-[10px] border border-stroke bg-surface-muted/50 p-3">
              <p className="text-[13px] font-semibold text-ink">Already reported ({openDefects.length}): no need to report these again</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ink-muted">
                {openDefects.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Badge tone={d.severity === "critical" ? "red" : d.severity === "minor" ? "amber" : "grey"}>{DEFECT_SEVERITY_LABELS[d.severity]}</Badge>
                    {d.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>
      {checklist.length === 0 ? (
        <Card>
          <CardBody>There is no pre-start checklist for this type of equipment yet.</CardBody>
        </Card>
      ) : (
        <PrestartForm
          orgId={orgId}
          assetId={assetId}
          checklist={checklist}
          tracksKm={tracksKm}
          tracksHours={tracksHours}
          lastKm={asset.current_odometer_km}
          lastHours={asset.current_engine_hours}
        />
      )}
    </>
  );
}
