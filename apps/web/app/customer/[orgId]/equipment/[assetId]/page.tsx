import type { Metadata } from "next";
import { IssueCategoryTag } from "@/features/operator/issue-category";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Pencil } from "lucide-react";
import {
  getAsset,
  getPersonNames,
  listAuditEvents,
  listConditionHistory,
  listDefects,
  getEquipmentCode,
  listActiveSafetyEvents,
  listInspections,
  listMeterReadings,
  listOpenConditionCauses,
  listReturnToServiceEvents,
} from "@hvems/api-client";
import { CONDITION_LABELS, METER_TYPE_LABELS, OWNER_TYPE_LABELS, prestartFrequencyText, formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { ConditionBadge, ConditionBanner } from "@/components/condition";
import { ResultBadge, SeverityBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Dl, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam, formatNumber } from "@/lib/utils";
import { ArchiveDialog } from "./archive-dialog";
import { MeterForm } from "./meter-form";
import { ReturnToServiceDialog } from "./return-to-service";
import { QrCard } from "./qr-card";
import { SafetyPanel } from "./safety-panel";

export const metadata: Metadata = { title: "Equipment" };

const READINGS_TITLE = {
  kilometres: "Odometer reading",
  hours: "Hour meter reading",
  both: "Odometer and hour meter",
  none: "Odometer / hour meter",
} as const;
const STATUS_TONE = {
  accepted: "green",
  pending_acceptance: "amber",
  rejected: "red",
  superseded: "grey",
} as const;
const STATUS_LABEL = {
  accepted: "Accepted",
  pending_acceptance: "Awaiting manager",
  rejected: "Rejected",
  superseded: "Amended",
} as const;

const FIELD_LABELS: Record<string, string> = {
  current_operator_id: "Current operator",
  current_odometer_km: "Odometer",
  current_engine_hours: "Hour meter",
  rops_fitted: "ROPS",
  fops_fitted: "FOPS",
  fire_suppression_fitted: "Fire suppression",
  site_id: "Site",
  client_id: "Client",
  asset_class_id: "Class",
  vin: "VIN",
  prestart_frequency: "Pre-start checks",
  prestart_every_days: "Pre-start checks",
};
const ACTION_WORDS: Record<string, string> = { update: "Changed", insert: "Added", delete: "Removed", generate_code: "New QR code", return_to_service: "Returned to service" };
const METHOD_WORDS: Record<string, string> = { system: "Automatic", password: "Signed in" };
const HIDDEN_FIELDS = /(_at|_since|_by)$/;
const humanise = (v: string) => {
  const t = v.replaceAll("_", " ").replace(/ id$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** "Odometer, Site" instead of raw column names; timestamps are left out. */
function changedFields(keys: string[]) {
  const shown = keys.filter((k) => !HIDDEN_FIELDS.test(k)).map((k) => FIELD_LABELS[k] ?? humanise(k));
  return [...new Set(shown)].join(", ") || "Readings updated";
}

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, assetId }, sp] = await Promise.all([params, searchParams]);
  const view = firstParam(sp.view) === "history" ? "history" : "overview";
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId) notFound();

  const [readings, history, audit, defects, prestarts, causes, rtsEvents, safety, code, names] = await Promise.all([
    view === "history" ? listMeterReadings(db, assetId, 20) : Promise.resolve([]),
    view === "history" ? listConditionHistory(db, assetId) : Promise.resolve([]),
    view === "history" && can(ctx.capabilities, "audit.view")
      ? listAuditEvents(db, {
          organisationId: orgId,
          entityType: "assets",
          entityId: assetId,
          limit: 20,
        })
      : Promise.resolve([]),
    listDefects(db, { organisationId: orgId, assetId, status: "open" }),
    listInspections(db, { organisationId: orgId, assetId, limit: 5 }),
    listOpenConditionCauses(db, assetId),
    view === "history" ? listReturnToServiceEvents(db, assetId, 5) : Promise.resolve([]),
    listActiveSafetyEvents(db, { organisationId: orgId, assetId }),
    getEquipmentCode(db, assetId),
    getPersonNames(db, [asset.current_operator_id]),
  ]);
  const operator = asset.current_operator_id ? (names.get(asset.current_operator_id) ?? "Former operator") : null;
  // Dates for the safety panel, formatted here in the company's timezone.
  const when: Record<string, string> = {};
  for (const h of safety.holds) when[h.id] = formatDateTimeAU(new Date(h.placed_at), ctx.timezone);
  for (const b of safety.breakdowns) when[b.id] = formatDateTimeAU(new Date(b.reported_at), ctx.timezone);
  for (const n of safety.notices) {
    when[n.id] = formatDateAU(new Date(`${n.issued_on}T00:00:00Z`), "UTC");
    if (n.clear_by) when[`${n.id}:clear`] = formatDateAU(new Date(`${n.clear_by}T00:00:00Z`), "UTC");
  }
  // Two-step clearance: repaired Critical defects leave an "awaiting return to service" cause.
  const awaitingReturn = causes.some((c) => c.kind === "awaiting_return_to_service");
  const otherOutOfService = causes.some((c) =>
    ["critical_defect", "unverified_unsafe_report", "critical_finding_awaiting_review", "out_of_service_hold"].includes(c.kind),
  );
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
            {asset.archived_at ? (
              <Badge tone="grey">Archived {formatDateAU(new Date(asset.archived_at), ctx.timezone)}</Badge>
            ) : (
              <ConditionBadge condition={asset.condition} />
            )}
          </span>
        }
        breadcrumb={{ label: "Equipment", href: base }}
        actions={
          <>
            {!asset.archived_at && can(ctx.capabilities, "inspections.submit") ? (
              <Button asChild variant="outline">
                <Link href={`${base}/${assetId}/prestart`}>
                  <ClipboardCheck /> Pre-start
                </Link>
              </Button>
            ) : null}
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
        <div className="mb-5 flex flex-col gap-3">
          <ConditionBanner condition={asset.condition} />
          {awaitingReturn ? (
            <div className="flex flex-col gap-3 rounded-[12px] border-2 border-warn-line bg-warn-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-bold text-warn-ink">Repaired: waiting to return to service</p>
                <p className="text-[13.5px] text-warn-ink">
                  {otherOutOfService
                    ? "Other Critical defects or holds are still open. Clear them first."
                    : "Step 2 of 2: confirm the equipment is fit to use. It stays Out of service until then."}
                </p>
              </div>
              {!otherOutOfService && can(ctx.capabilities, "assets.return_to_service") ? (
                <ReturnToServiceDialog orgId={orgId} assetId={assetId} assetNumber={asset.asset_number} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-5 rounded-[10px] border border-stroke bg-surface px-4 py-3 text-[14px] text-ink-muted">
          Archived ({asset.archive_disposal}) effective{" "}
          {asset.archive_effective_date ? formatDateAU(new Date(asset.archive_effective_date), ctx.timezone) : "—"}: {asset.archive_reason}. History is kept and
          the asset no longer counts towards the fleet subscription from the following month.
        </div>
      )}

      <nav className="mb-5 flex gap-1 border-b border-stroke" aria-label="Equipment views">
        {(
          [
            ["overview", "Overview", base + "/" + assetId],
            ["history", "History", base + "/" + assetId + "?view=history"],
          ] as const
        ).map(([id, label, href]) => (
          <Link
            key={id}
            href={href}
            aria-current={view === id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium",
              view === id ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === "overview" ? (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Details" />
              <CardBody>
                <Dl
                  className="lg:grid-cols-3"
                  items={(
                    [
                      { label: "Asset number", value: asset.asset_number },
                      { label: "Class", value: asset.asset_class?.name },
                      { label: "Year", value: asset.year },
                      { label: "Make", value: asset.make },
                      { label: "Model", value: asset.model },
                      { label: "Serial number", value: asset.serial_number },
                      {
                        label: "Registration",
                        value: asset.registration_number ? `${asset.registration_number} ${asset.registration_state ?? ""}` : null,
                      },
                      { label: "VIN", value: asset.vin },
                      {
                        label: "Owner type",
                        value: OWNER_TYPE_LABELS[asset.owner_type],
                      },
                      { label: "Client", value: asset.client?.name },
                      {
                        label: "Site",
                        value: asset.site ? `${asset.site.name}${asset.site.suburb ? `, ${asset.site.suburb}` : ""}` : null,
                      },
                      {
                        label: "Odometer / hour meter",
                        value: METER_TYPE_LABELS[asset.meter_type],
                      },
                      {
                        label: "Current operator",
                        value: operator ? `${operator} · ${formatDateAU(new Date(asset.current_operator_since!), ctx.timezone)}` : "No pre-start yet",
                      },
                      {
                        label: "Pre-start checks",
                        value: prestartFrequencyText(asset.prestart_frequency, asset.prestart_every_days) ?? "As per type",
                      },
                      {
                        label: "Safety equipment fitted",
                        value:
                          [asset.rops_fitted && "ROPS", asset.fops_fitted && "FOPS", asset.fire_suppression_fitted && "Fire suppression"]
                            .filter(Boolean)
                            .join(", ") || "None",
                      },
                    ] as { label: string; value: React.ReactNode }[]
                  ).filter((i) => i.value !== null && i.value !== undefined && i.value !== "")}
                />
                {asset.notes ? <p className="mt-5 rounded-[8px] bg-surface-muted p-3 text-[14px] whitespace-pre-wrap text-ink-muted">{asset.notes}</p> : null}
              </CardBody>
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title={READINGS_TITLE[asset.meter_type]} />
                <CardBody className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[10px] bg-surface-muted p-3">
                      <p className="text-[12px] text-ink-muted">Odometer</p>
                      <p className="text-[20px] font-bold">{asset.current_odometer_km !== null ? `${formatNumber(asset.current_odometer_km)} km` : "—"}</p>
                      <p className="text-[11.5px] text-ink-subtle">
                        {asset.odometer_read_at ? formatDateTimeAU(new Date(asset.odometer_read_at), ctx.timezone) : "No reading"}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-surface-muted p-3">
                      <p className="text-[12px] text-ink-muted">Hour meter</p>
                      <p className="text-[20px] font-bold">{asset.current_engine_hours !== null ? `${formatNumber(asset.current_engine_hours, 1)} h` : "—"}</p>
                      <p className="text-[11.5px] text-ink-subtle">
                        {asset.engine_hours_read_at ? formatDateTimeAU(new Date(asset.engine_hours_read_at), ctx.timezone) : "No reading"}
                      </p>
                    </div>
                  </div>
                  {canRecord ? (
                    <MeterForm
                      orgId={orgId}
                      assetId={assetId}
                      meterType={asset.meter_type}
                      canAddMeter={can(ctx.capabilities, "meter_readings.accept")}
                      last={{ km: asset.current_odometer_km, hours: asset.current_engine_hours }}
                    />
                  ) : null}
                </CardBody>
              </Card>
              {!asset.archived_at ? (
                <QrCard orgId={orgId} assetId={assetId} code={code} canManage={can(ctx.capabilities, "assets.manage")} timezone={ctx.timezone} />
              ) : null}
            </div>
          </div>

          {!asset.archived_at ? (
            <SafetyPanel
              orgId={orgId}
              assetId={assetId}
              timezone={ctx.timezone}
              holds={safety.holds}
              breakdowns={safety.breakdowns}
              notices={safety.notices}
              formatWhen={when}
              can={{
                placeHold: can(ctx.capabilities, "holds.place"),
                removeOutOfService: can(ctx.capabilities, "holds.remove_out_of_service"),
                report: can(ctx.capabilities, "defects.report"),
              }}
            />
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                title={`Open defects (${defects.length})`}
                action={
                  <Link href={`/customer/${orgId}/defects`} className="text-[13px] font-semibold text-link hover:underline">
                    All defects
                  </Link>
                }
              />
              <CardBody className={defects.length ? "flex flex-col divide-y divide-stroke px-0 pb-0" : undefined}>
                {defects.length === 0 ? (
                  <p className="text-[14px] text-ink-muted">No open defects.</p>
                ) : (
                  defects.map((d) => (
                    <Link
                      key={d.id}
                      href={`/customer/${orgId}/defects/${d.id}`}
                      className="flex items-start gap-2.5 px-5 py-2.5 text-[14px] hover:bg-surface-muted/60"
                    >
                      <SeverityBadge severity={d.severity} />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{d.title}</span>
                        {d.description ? <span className="block text-[13px] text-ink-muted">“{d.description}”</span> : null}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-subtle">
                          <IssueCategoryTag value={d.issue_category} source={d.source} className="text-[12px]" />
                          {formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Recent pre-starts"
                action={
                  <Link href={`/customer/${orgId}/inspections`} className="text-[13px] font-semibold text-link hover:underline">
                    All inspections
                  </Link>
                }
              />
              <CardBody className={prestarts.length ? "flex flex-col divide-y divide-stroke px-0 pb-0" : undefined}>
                {prestarts.length === 0 ? (
                  <p className="text-[14px] text-ink-muted">No pre-starts yet.</p>
                ) : (
                  prestarts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/customer/${orgId}/inspections/${p.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-[14px] hover:bg-surface-muted/60"
                    >
                      <span>
                        {formatDateTimeAU(new Date(p.submitted_at), ctx.timezone)}
                        <span className="block text-[12.5px] text-ink-subtle">{p.header.operator_name ?? "—"}</span>
                      </span>
                      <ResultBadge result={p.result} />
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Reading history" />
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
                            {r.out_of_sequence ? <span className="block text-[11.5px] font-normal text-warn-ink">Out of sequence</span> : null}
                            {r.lower_reading_reason ? (
                              <span className="block text-[11.5px] font-normal text-ink-subtle">Lower: {r.lower_reading_reason}</span>
                            ) : null}
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
              <CardHeader
                title="Condition history"
                description={
                  rtsEvents[0]
                    ? `Set automatically from defects and holds. Last returned to service ${formatDateTimeAU(new Date(rtsEvents[0].returned_at), ctx.timezone)}: ${rtsEvents[0].note}`
                    : "Set automatically from defects and holds; no one can set it by hand"
                }
              />
              <CardBody className="px-0 pb-1">
                {history.length === 0 ? (
                  <EmptyState title="Active since registration">Changes when a defect or hold is raised or cleared.</EmptyState>
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
              <CardHeader title="Changes" />
              <CardBody className="px-0 pb-1">
                {audit.length === 0 ? (
                  <EmptyState title="No audit events" />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>When</TH>
                        <TH>Action</TH>
                        <TH>How</TH>
                        <TH>What changed</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {audit.map((e) => (
                        <TR key={e.id}>
                          <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(e.occurred_at), ctx.timezone)}</TD>
                          <TD>{ACTION_WORDS[e.action] ?? humanise(e.action)}</TD>
                          <TD>{METHOD_WORDS[e.actor_method] ?? humanise(e.actor_method)}</TD>
                          <TD className="max-w-[420px] truncate text-ink-muted">
                            {e.action === "update" ? changedFields(Object.keys(e.changes)) : e.action === "insert" ? "Created" : "—"}
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
      )}
    </>
  );
}
