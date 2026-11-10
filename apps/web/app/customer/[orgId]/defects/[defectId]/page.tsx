import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefect, getOrganisation, listAuditEvents, listDefects, listMembers, signInspectionPhotos } from "@hvems/api-client";
import { DEFECT_SEVERITY_EFFECT, DEFECT_STATUS_LABELS, formatDateAU, formatDateTimeAU, todayISO } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { SeverityBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DefectActions } from "./defect-actions";

export const metadata: Metadata = { title: "Defect" };

const STATUS_TONE = { open: "amber", closed: "grey", repaired: "green", dismissed: "grey", merged: "grey" } as const;
const ACTION_LABEL: Record<string, string> = {
  insert: "Reported",
  triage: "Triaged",
  dismiss: "Dismissed",
  merge: "Merged",
  defer: "Repair deferred",
  clear: "Marked repaired",
  update: "Updated",
};

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** One defect: what was reported, what has been done, and the next steps (O-09). */
export default async function DefectPage({ params }: { params: Promise<{ orgId: string; defectId: string }> }) {
  const { orgId, defectId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const d = await getDefect(db, defectId).catch(() => null);
  if (!d || d.organisation_id !== orgId) notFound();

  const [org, sameAsset, members, history, itemPhotos] = await Promise.all([
    getOrganisation(db, orgId),
    listDefects(db, { organisationId: orgId, assetId: d.asset_id, status: "open" }),
    listMembers(db, orgId).catch(() => []),
    can(ctx.capabilities, "audit.view") ? listAuditEvents(db, { organisationId: orgId, entityType: "defects", entityId: d.id, limit: 30 }).then((rows) => rows.filter((r) => r.action !== "update")) : Promise.resolve([]),
    d.inspection_id && d.item_code
      ? db.from("inspection_photos").select("storage_path").eq("inspection_id", d.inspection_id).eq("item_code", d.item_code).then((r) => (r.data ?? []).map((x) => x.storage_path as string))
      : Promise.resolve([] as string[]),
  ]);
  const photoPaths = [...itemPhotos, ...d.evidence_paths];
  const urls = await signInspectionPhotos(db, photoPaths).catch(() => ({}) as Record<string, string>);
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile?.full_name || (id === ctx.user.id ? ctx.user.fullName : null) || "—";
  const tz = ctx.timezone;
  const due = d.deferred_until ?? d.due_date;
  const overdue = d.status === "open" && due !== null && due < todayISO(tz);
  const caps = ctx.capabilities;

  return (
    <>
      <PageHeader
        title={d.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SeverityBadge severity={d.severity} />
            <Badge tone={STATUS_TONE[d.status]}>{DEFECT_STATUS_LABELS[d.status]}</Badge>
            {d.status === "open" && !d.triaged_at ? <Badge tone="blue">New: not triaged</Badge> : null}
            {overdue ? <Badge tone="red">Overdue</Badge> : null}
          </span>
        }
        breadcrumb={{ label: "Defects & Safety", href: `/customer/${orgId}/defects` }}
      />

      {d.status === "open" ? (
        <Card className="mb-5">
          <CardHeader title="Next step" description={DEFECT_SEVERITY_EFFECT[d.severity]} />
          <CardBody>
            <DefectActions
              orgId={orgId}
              assetId={d.asset_id}
              defect={{
                id: d.id,
                severity: d.severity,
                title: d.title,
                due,
                deferLimit: d.due_date ? formatDateAU(addDays(d.due_date, 30), "UTC") : null,
              }}
              can={{
                triage: can(caps, "defects.triage"),
                lower: can(caps, "defects.lower_severity"),
                dismissCritical: can(caps, "defects.dismiss_critical"),
                defer: can(caps, "defects.defer_minor"),
                clearCritical: can(caps, "defects.clear_critical"),
                clearOther: can(caps, "defects.clear_non_critical"),
              }}
              otherOpen={sameAsset.filter((o) => o.id !== d.id).map((o) => ({ id: o.id, title: o.title, severity: o.severity }))}
              members={
                members.length
                  ? members.filter((m) => m.status === "active").map((m) => ({ userId: m.user_id, name: m.profile?.full_name || m.profile?.email || "Member" }))
                  : [{ userId: ctx.user.id, name: ctx.user.fullName || ctx.user.email }]
              }
              meId={ctx.user.id}
              repairerRule={!!org.settings.repairer_cannot_clear_own_critical}
            />
            {!can(caps, "defects.triage") ? <p className="text-[14px] text-ink-muted">A Fleet Manager or the Owner deals with this defect.</p> : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Details" />
          <CardBody className="flex flex-col gap-4">
            <Dl
              className="grid-cols-2 sm:grid-cols-3"
              items={[
                {
                  label: "Equipment",
                  value: (
                    <Link href={`/customer/${orgId}/equipment/${d.asset_id}`} className="font-semibold text-link hover:underline">
                      {d.asset?.asset_number ?? "Equipment"}
                    </Link>
                  ),
                },
                { label: "Reported", value: formatDateTimeAU(new Date(d.reported_at), tz) },
                { label: "Reported by", value: nameOf(d.reported_by) },
                {
                  label: "Source",
                  value: d.inspection_id ? (
                    <Link href={`/customer/${orgId}/inspections/${d.inspection_id}`} className="text-link hover:underline">
                      Pre-start {d.item_code}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                ...(due ? [{ label: d.deferred_until ? "Due (deferred)" : "Repair due", value: formatDateAU(new Date(`${due}T00:00:00Z`), "UTC") }] : []),
                ...(d.triaged_at ? [{ label: "Triaged", value: `${formatDateTimeAU(new Date(d.triaged_at), tz)} · ${nameOf(d.triaged_by)}` }] : []),
              ]}
            />
            {d.description ? <p className="rounded-[10px] bg-surface-muted px-4 py-3 text-[14.5px] text-ink">“{d.description}”</p> : null}
            {d.deferral_reason ? (
              <p className="text-[14px] text-ink-muted">
                <strong className="text-ink">Deferral reason:</strong> {d.deferral_reason}
              </p>
            ) : null}
            {d.status !== "open" ? (
              <div className="rounded-[10px] border border-stroke px-4 py-3 text-[14px]">
                <p className="font-semibold text-ink">
                  {DEFECT_STATUS_LABELS[d.status]} {d.closed_at ? `· ${formatDateTimeAU(new Date(d.closed_at), tz)}` : ""} · {nameOf(d.closed_by)}
                </p>
                {d.resolution_note ? <p className="mt-1 text-ink-muted">{d.resolution_note}</p> : null}
                {d.status === "repaired" && d.repaired_by ? <p className="mt-1 text-ink-muted">Repaired by {nameOf(d.repaired_by)}</p> : null}
                {d.merged_into ? (
                  <Link href={`/customer/${orgId}/defects/${d.merged_into}`} className="mt-1 inline-block text-link hover:underline">
                    Open the kept defect
                  </Link>
                ) : null}
              </div>
            ) : null}
            {photoPaths.some((p) => urls[p]) ? (
              <div className="flex flex-wrap gap-2">
                {photoPaths
                  .filter((p) => urls[p])
                  .map((p) => (
                    <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-[8px] border border-stroke">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={urls[p]} alt="Defect photo" className="size-full object-cover" />
                    </a>
                  ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="History" />
          <CardBody>
            {history.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Reported {formatDateTimeAU(new Date(d.reported_at), tz)}.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-[13.5px]">
                {history.map((h) => (
                  <li key={h.id}>
                    <p className="font-semibold text-ink">{ACTION_LABEL[h.action] ?? h.action}</p>
                    <p className="text-ink-subtle">{formatDateTimeAU(new Date(h.occurred_at), tz)}</p>
                    {typeof (h.changes as Record<string, unknown>)?.reason === "string" ? (
                      <p className="text-ink-muted">{String((h.changes as Record<string, unknown>).reason)}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
