import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Pencil } from "lucide-react";
import { getAsset, listAuditEvents, listConditionHistory, listMeterReadings } from "@hvems/api-client";
import { CONDITION_LABELS, METER_TYPE_LABELS, OWNER_TYPE_LABELS, formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { ConditionBadge, ConditionBanner } from "@/components/condition";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Dl, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { ArchiveDialog } from "./archive-dialog";
import { MeterForm } from "./meter-form";

export const metadata: Metadata = { title: "Equipment" };

const STATUS_TONE = { accepted: "green", pending_acceptance: "amber", rejected: "red", superseded: "grey" } as const;
const STATUS_LABEL = { accepted: "Accepted", pending_acceptance: "Awaiting manager", rejected: "Rejected", superseded: "Amended" } as const;

export default async function AssetPage({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId) notFound();

  const [readings, history, audit] = await Promise.all([
    listMeterReadings(db, assetId, 20),
    listConditionHistory(db, assetId),
    can(ctx.capabilities, "audit.view") ? listAuditEvents(db, { organisationId: orgId, entityType: "assets", entityId: assetId, limit: 20 }) : Promise.resolve([]),
  ]);
  const manage = can(ctx.capabilities, "assets.manage") && !asset.archived_at;
  // Assets without a meter show the form only to managers, who can start tracking one.
  const canRecord =
    can(ctx.capabilities, "meter_readings.record") && !asset.archived_at && (asset.meter_type !== "none" || can(ctx.capabilities, "meter_readings.accept"));
  const base = `/customer/${orgId}/equipment`;

  return (
    <>
      <PageHeader
        title={`${asset.asset_number}${asset.make || asset.model ? ` · ${[asset.make, asset.model].filter(Boolean).join(" ")}` : ""}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {asset.asset_class?.name}
            {asset.archived_at ? <Badge tone="grey">Archived {formatDateAU(new Date(asset.archived_at), ctx.timezone)}</Badge> : <ConditionBadge condition={asset.condition} />}
          </span>
        }
        breadcrumb={{ label: "Equipment", href: base }}
        actions={
          <>
            {!asset.archived_at ? <PreStartButton /> : null}
            {manage ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`${base}/${assetId}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
                {can(ctx.capabilities, "assets.import_archive") ? (
                  <ArchiveDialog orgId={orgId} assetId={assetId} assetNumber={asset.asset_number} timezone={ctx.timezone} />
                ) : null}
              </>
            ) : null}
          </>
        }
      />
      {!asset.archived_at ? (
        <div className="mb-5">
          <ConditionBanner condition={asset.condition} />
        </div>
      ) : (
        <div className="mb-5 rounded-[10px] border border-stroke bg-white px-4 py-3 text-[14px] text-ink-muted">
          Archived ({asset.archive_disposal}) effective {asset.archive_effective_date ? formatDateAU(new Date(asset.archive_effective_date), ctx.timezone) : "—"}: {asset.archive_reason}.
          History is kept and the asset no longer counts towards the fleet subscription from the following month.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Details" />
          <CardBody>
            <Dl
              className="lg:grid-cols-3"
              items={[
                { label: "Asset number", value: asset.asset_number },
                { label: "Class", value: asset.asset_class?.name },
                { label: "Year", value: asset.year },
                { label: "Make", value: asset.make },
                { label: "Model", value: asset.model },
                { label: "Serial number", value: asset.serial_number },
                { label: "Registration", value: asset.registration_number ? `${asset.registration_number} ${asset.registration_state ?? ""}` : null },
                { label: "VIN", value: asset.vin },
                { label: "Owner type", value: OWNER_TYPE_LABELS[asset.owner_type] },
                { label: "Client", value: asset.client?.name },
                { label: "Site", value: asset.site ? `${asset.site.name}${asset.site.suburb ? `, ${asset.site.suburb}` : ""}` : null },
                { label: "Meter type", value: METER_TYPE_LABELS[asset.meter_type] },
              ]}
            />
            {asset.notes ? <p className="mt-5 rounded-[8px] bg-surface-muted p-3 text-[14px] whitespace-pre-wrap text-ink-muted">{asset.notes}</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Meter" description="Readings never overwrite each other" />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] bg-surface-muted p-3">
                <p className="text-[12px] text-ink-muted">Odometer</p>
                <p className="text-[20px] font-bold">{asset.current_odometer_km !== null ? `${formatNumber(asset.current_odometer_km)} km` : "—"}</p>
                <p className="text-[11.5px] text-ink-subtle">{asset.odometer_read_at ? formatDateTimeAU(new Date(asset.odometer_read_at), ctx.timezone) : "No reading"}</p>
              </div>
              <div className="rounded-[10px] bg-surface-muted p-3">
                <p className="text-[12px] text-ink-muted">Engine hours</p>
                <p className="text-[20px] font-bold">{asset.current_engine_hours !== null ? `${formatNumber(asset.current_engine_hours, 1)} h` : "—"}</p>
                <p className="text-[11.5px] text-ink-subtle">{asset.engine_hours_read_at ? formatDateTimeAU(new Date(asset.engine_hours_read_at), ctx.timezone) : "No reading"}</p>
              </div>
            </div>
            {canRecord ? (
              <MeterForm orgId={orgId} assetId={assetId} meterType={asset.meter_type} canAddMeter={can(ctx.capabilities, "meter_readings.accept")} />
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Meter history" />
          <CardBody className="px-0 pb-1">
            {readings.length === 0 ? (
              <EmptyState title="No readings yet" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Read at</TH>
                    <TH>Reading</TH>
                    <TH>Source</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {readings.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(r.read_at), ctx.timezone)}</TD>
                      <TD className="font-semibold whitespace-nowrap">
                        {formatNumber(r.value, 1)} {r.unit === "km" ? "km" : "h"}
                        {r.out_of_sequence ? <span className="block text-[11.5px] font-normal text-[#9a4a00]">Out of sequence</span> : null}
                        {r.lower_reading_reason ? <span className="block text-[11.5px] font-normal text-ink-subtle">Lower: {r.lower_reading_reason}</span> : null}
                      </TD>
                      <TD className="capitalize">{r.source.replace("_", " ")}</TD>
                      <TD>
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Condition history" description="Set automatically from defects and holds; no one can set it by hand" />
          <CardBody className="px-0 pb-1">
            {history.length === 0 ? (
              <EmptyState title="Active since registration">Defects, holds and clearances arrive with increment 2B.</EmptyState>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>When</TH>
                    <TH>Change</TH>
                    <TH>Cause</TH>
                  </tr>
                </THead>
                <tbody>
                  {history.map((h) => (
                    <TR key={h.id}>
                      <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(h.changed_at), ctx.timezone)}</TD>
                      <TD>
                        {CONDITION_LABELS[h.from_condition]} → <strong>{CONDITION_LABELS[h.to_condition]}</strong>
                      </TD>
                      <TD className="capitalize">{h.cause_kind?.replaceAll("_", " ") ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {can(ctx.capabilities, "audit.view") ? (
        <Card className="mt-5">
          <CardHeader title="Audit history" description="Every change, with who made it and how they identified themselves" />
          <CardBody className="px-0 pb-1">
            {audit.length === 0 ? (
              <EmptyState title="No audit events" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>When</TH>
                    <TH>Action</TH>
                    <TH>Identified by</TH>
                    <TH>Fields</TH>
                  </tr>
                </THead>
                <tbody>
                  {audit.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), ctx.timezone)}</TD>
                      <TD className="capitalize">{e.action}</TD>
                      <TD>{e.actor_method.replace("_", " ")}</TD>
                      <TD className="max-w-[420px] truncate text-ink-muted">
                        {e.action === "update" ? Object.keys(e.changes).join(", ") : e.action === "insert" ? "Created" : JSON.stringify(e.changes)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

/**
 * Pre-starts arrive in 2B. The standard checklists are waiting on HVEMS
 * approval (docs/roadmap.md, "Pending decisions"), so the button is shown
 * disabled rather than leading to a placeholder form.
 */
function PreStartButton() {
  return (
    <span title="Pre-start checklists are coming soon" className="cursor-not-allowed">
      <Button variant="outline" disabled>
        <ClipboardCheck /> Pre-start
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">Coming soon</span>
      </Button>
    </span>
  );
}
