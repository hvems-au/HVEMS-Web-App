import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Phone } from "lucide-react";
import { getEngagementDetails, getEngagementExtras, getPersonNames, listMarketplaceMessages, listMembers, signMarketplaceFiles, type EngagementDetails } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrgContext } from "@/lib/session";
import { EngagementPanel, type PanelData } from "./engagement-panel";
import { JobSummary } from "./job-summary";
import { availabilityText, priceText, withinDays } from "./labels";
import { MessageThread } from "./message-thread";

/** One engagement for either party (MKT-11..19). Private details reach only the engaged provider (the database decides). */
export async function EngagementScreen({ engagementId, ctx, side, base }: { engagementId: string; ctx: OrgContext; side: "poster" | "provider"; base: string }) {
  const db = await createSupabaseServerClient();
  const d: EngagementDetails | null = await getEngagementDetails(db, engagementId).catch(() => null);
  if (!d || !d.side || d.side !== side) notFound();
  const e = d.engagement;
  const tz = ctx.timezone;
  const when = (iso: string | null) => (iso ? formatDateTimeAU(new Date(iso), tz) : null);
  const [extras, messages, team] = await Promise.all([
    getEngagementExtras(db, e.id),
    listMarketplaceMessages(db, e.job_id, e.provider_id),
    side === "provider" ? listMembers(db, e.provider_id).catch(() => []) : Promise.resolve([]),
  ]);
  const links = await signMarketplaceFiles(db, [...d.files.map((f) => f.path), ...e.completion_paths]);
  const names = await getPersonNames(db, [...new Set(messages.map((m) => m.sender_id))]);
  const canManage = side === "provider" ? can(ctx.capabilities, "provider.engagements.manage") : can(ctx.capabilities, "marketplace.accept") || can(ctx.capabilities, "marketplace.post");
  const reviewOpen =
    side === "poster" &&
    !extras.review &&
    ["confirmed_complete", "completed_unconfirmed"].includes(e.status) &&
    withinDays(e.completed_at, 14);
  const other = side === "poster" ? d.provider : d.poster;

  const data: PanelData = {
    engagementId: e.id,
    jobId: e.job_id,
    side,
    status: e.status,
    urgent: d.job.urgency === "urgent",
    feeCents: e.poster_fee_cents,
    feeStatus: e.fee_status,
    providerId: e.provider_id,
    canManage,
    safetyAcknowledged: !!e.safety_acknowledged_at,
    scheduledStart: when(e.scheduled_start),
    onMyWayAt: when(e.on_my_way_at),
    eta: when(e.eta_at),
    onSite: when(e.on_site_at),
    technicianId: e.technician_id,
    team: team.filter((m) => m.status === "active").map((m) => ({ value: m.user_id, label: m.profile?.full_name || m.profile?.email || "Member" })),
    completion: {
      outcome: e.completion_outcome,
      notes: e.completion_notes,
      parts: e.parts_used,
      remaining: e.remaining_issues,
      recommendations: e.recommendations,
      at: when(e.completed_at),
      files: e.completion_paths.map((p) => ({ name: p.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? "File", url: links.get(p) ?? null })),
    },
    correctionReason: e.correction_reason,
    payment: { by: e.payment_reported_by, at: when(e.payment_reported_at), note: e.payment_note },
    findings: extras.findings,
    variations: extras.variations.map((v) => ({ ...v, when: when(v.created_at) ?? "" })),
    cases: extras.cases.map((c) => ({ ...c, when: when(c.created_at) ?? "", respondBy: when(c.respond_by) })),
    review: extras.review,
    canReview: reviewOpen && canManage,
    cancel: { at: when(e.cancelled_at), by: e.cancelled_by_side, reason: e.cancel_reason },
    otherName: other.name,
  };

  return (
    <>
      <PageHeader
        title={d.job.title}
        description={`Engagement ${e.number} · ${side === "poster" ? d.provider.name : d.poster.name} · accepted ${when(e.accepted_at)}`}
        breadcrumb={side === "poster" ? { label: "Job", href: `${base}/marketplace/${e.job_id}` } : { label: "Engagements", href: `${base}/engagements` }}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <EngagementPanel d={data} />
          <Card>
            <CardHeader title="Agreed terms" description="The exact proposal version accepted" />
            <CardBody className="grid grid-cols-1 gap-3 pt-0 text-[14px] sm:grid-cols-3">
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Price</span>
                <span className="font-semibold">{priceText(d.terms)}</span>
              </p>
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Availability</span>
                {availabilityText(d.terms)}
              </p>
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Version</span>
                {d.terms.version}
              </p>
              {d.terms.inclusions ? <p className="sm:col-span-3"><span className="block text-[12.5px] text-ink-subtle">Included</span>{d.terms.inclusions}</p> : null}
              {d.terms.exclusions ? <p className="sm:col-span-3"><span className="block text-[12.5px] text-ink-subtle">Not included</span>{d.terms.exclusions}</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Job" />
            <CardBody className="flex flex-col gap-4 pt-0">
              <JobSummary job={d.job} fileLinks={links} />
              <dl className="grid grid-cols-1 gap-3 rounded-[10px] border border-stroke p-3.5 text-[14px] sm:grid-cols-2">
                <div>
                  <dt className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                    <Lock className="size-3.5" aria-hidden /> Address
                  </dt>
                  <dd>{d.job.address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                    <Lock className="size-3.5" aria-hidden /> Site access and safety
                  </dt>
                  <dd className="whitespace-pre-wrap">{d.job.site_access_notes ?? "—"}</dd>
                </div>
                {d.files.some((f) => !f.shared) ? (
                  <div className="sm:col-span-2">
                    <dt className="text-[12.5px] text-ink-subtle">Other files</dt>
                    <dd>
                      {d.files
                        .filter((f) => !f.shared)
                        .map((f) => (
                          <a key={f.id} href={links.get(f.path)} target="_blank" rel="noreferrer" className="mr-3 text-link hover:underline">
                            {f.file_name}
                          </a>
                        ))}
                    </dd>
                  </div>
                ) : null}
                {side === "poster" && d.job.work_order_id ? (
                  <div>
                    <dt className="text-[12.5px] text-ink-subtle">Work order</dt>
                    <dd>
                      <Link href={`${base}/work-orders/${d.job.work_order_id}`} className="text-link hover:underline">
                        Open the work order
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        </div>
        <div className="flex flex-col gap-5 self-start">
          <Card>
            <CardHeader title={side === "poster" ? "Provider" : "Customer"} />
            <CardBody className="flex flex-col gap-1 pt-0 text-[14px]">
              <p className="font-semibold">{other.name}</p>
              {other.contact_name ? <p>{other.contact_name}</p> : null}
              {other.contact_phone ? (
                <a href={`tel:${other.contact_phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-link hover:underline">
                  <Phone className="size-4" aria-hidden /> {other.contact_phone}
                </a>
              ) : null}
              {other.contact_email ? (
                <a href={`mailto:${other.contact_email}`} className="text-link hover:underline">
                  {other.contact_email}
                </a>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Messages" />
            <CardBody className="pt-0">
              <MessageThread
                jobId={e.job_id}
                providerId={e.provider_id}
                portalPath={base}
                canSend={e.status !== "cancelled"}
                placeholder="Message"
                messages={messages.map((m) => ({
                  id: m.id,
                  mine: side === "provider" ? m.from_provider : !m.from_provider,
                  who: names.get(m.sender_id) ?? (m.from_provider ? d.provider.name : d.poster.name),
                  body: m.body,
                  when: when(m.created_at) ?? "",
                  masked: m.masked,
                  clarification: m.is_clarification,
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
