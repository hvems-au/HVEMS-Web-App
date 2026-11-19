import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, Lock } from "lucide-react";
import {
  formatWorkOrderNumber,
  getMarketplaceJob,
  getPersonNames,
  listEngagements,
  listJobProposals,
  listMarketplaceJobFiles,
  listMarketplaceMessages,
  marketplaceRpc,
  previewMarketplaceJob,
  signMarketplaceFiles,
} from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { AcceptProposalButton, JobControls } from "@/features/marketplace/job-controls";
import { JobSummary } from "@/features/marketplace/job-summary";
import { BADGE_LABELS, ENGAGEMENT_STATUS, PROPOSAL_STATUS, aud, availabilityText, dmy, priceText } from "@/features/marketplace/labels";
import { MessageThread } from "@/features/marketplace/message-thread";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Marketplace job" };

/** A posted job: what providers see, the private details, proposals to compare and the question threads (MKT-04/08/10). */
export default async function MarketplaceJobPage({ params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const canPost = can(ctx.capabilities, "marketplace.post");
  const db = await createSupabaseServerClient();
  const job = await getMarketplaceJob(db, orgId, jobId);
  if (!job) notFound();
  const canAccept = can(ctx.capabilities, "marketplace.accept");
  const [pub, proposals, messages, files, engagements] = await Promise.all([
    previewMarketplaceJob(db, jobId),
    listJobProposals(db, jobId),
    listMarketplaceMessages(db, jobId),
    listMarketplaceJobFiles(db, jobId),
    listEngagements(db, { jobId }),
  ]);
  const links = await signMarketplaceFiles(
    db,
    files.map((f) => f.path),
  );
  const names = await getPersonNames(db, [...new Set(messages.filter((m) => !m.from_provider).map((m) => m.sender_id))]);
  // Business names for every provider who asked or proposed (database function: organisations aren't readable across tenants).
  const providerName = new Map(
    (await marketplaceRpc<{ id: string; name: string }[]>(db, "marketplace_thread_providers", { p_job_id: jobId }).catch(() => [])).map((x) => [x.id, x.name]),
  );
  const threads = [...new Set(messages.map((m) => m.provider_id))];
  const open = pub.status === "open";
  const active = proposals.filter((p) => p.status === "active");
  const base = `/customer/${orgId}/marketplace`;

  return (
    <>
      <PageHeader
        title={job.title}
        description={`Job ${job.number}${job.work_order ? ` · ${formatWorkOrderNumber(job.work_order.number)}` : ""} · posted ${formatDateTimeAU(new Date(job.posted_at), ctx.timezone)}`}
        breadcrumb={{ label: "Marketplace", href: base }}
        actions={
          canPost ? (
            <JobControls
              orgId={orgId}
              jobId={job.id}
              category={job.category}
              canInvite={open}
              canClarify={!job.clarification_sent_at && (threads.length > 0 || proposals.length > 0) && open}
              canExtend={job.urgency === "standard" && !job.extended_at && (pub.status === "open" || pub.status === "expired")}
              canWithdraw={pub.status === "open" || pub.status === "expired"}
            />
          ) : null
        }
      />
      {engagements.length ? (
        <Card className="mb-5">
          <CardHeader title="Engagements" />
          <ul className="divide-y divide-stroke">
            {engagements.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                <Link href={`/customer/${orgId}/engagements/${e.id}`} className="font-semibold text-link hover:underline">
                  Engagement {e.number} · {providerName.get(e.provider_id) ?? "Provider"}
                </Link>
                <span>{ENGAGEMENT_STATUS[e.status]?.label ?? e.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card>
            <CardHeader title={`Proposals (${proposals.length})`} description="Compare price, availability and what HVEMS has verified. Accepting a proposal arrives with connection fees." />
            {proposals.length === 0 ? (
              <EmptyState title="No proposals yet">
                {job.urgency === "urgent"
                  ? "If none arrive within 30 minutes, invite providers directly or use your own contacts."
                  : "Matching providers have been alerted. You can also invite providers."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-stroke">
                {proposals.map((p) => {
                  const st = PROPOSAL_STATUS[p.status];
                  return (
                    <li key={p.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                            {p.provider.name}
                            {p.provider.badges.length ? <BadgeCheck className="size-4 text-ok-ink" aria-label="Verified" /> : null}
                          </p>
                          <p className="text-[13px] text-ink-muted">
                            {p.provider.regions.join(", ")}
                            {p.provider.mobile_service ? " · Mobile service" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.conflict ? (
                            <Badge tone="amber">
                              <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />
                              Possible conflict of interest
                            </Badge>
                          ) : null}
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {p.status === "active" && open && canAccept ? (
                            <AcceptProposalButton
                              orgId={orgId}
                              proposalId={p.id}
                              providerName={p.provider.name}
                              feeText={`Your connection fee is ${aud(p.terms.fee_cents)}${ctx.context.kind === "company" ? " (or covered by your monthly waiver)" : ""}.`}
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
                        <p>
                          <span className="block text-[12px] text-ink-subtle">Price</span>
                          <span className="font-semibold">{priceText(p.terms)}</span>
                        </p>
                        <p>
                          <span className="block text-[12px] text-ink-subtle">Availability</span>
                          {availabilityText(p.terms)}
                        </p>
                        <p>
                          <span className="block text-[12px] text-ink-subtle">Valid until</span>
                          {formatDateTimeAU(new Date(p.valid_until), ctx.timezone)}
                        </p>
                      </div>
                      {p.terms.inclusions || p.terms.exclusions || p.terms.assumptions || p.terms.note ? (
                        <dl className="mt-2 grid grid-cols-1 gap-2 text-[13.5px] sm:grid-cols-3">
                          {(
                            [
                              ["Included", p.terms.inclusions],
                              ["Not included", p.terms.exclusions],
                              ["Assumptions", p.terms.assumptions],
                              [`What changed (v${p.version})`, p.terms.note],
                            ] as const
                          ).map(([l, v]) =>
                            v ? (
                              <div key={l}>
                                <dt className="text-[12px] text-ink-subtle">{l}</dt>
                                <dd className="whitespace-pre-wrap text-ink-muted">{v}</dd>
                              </div>
                            ) : null,
                          )}
                        </dl>
                      ) : null}
                      <p className="mt-2 text-[12.5px] text-ink-subtle">
                        {p.provider.badges.map((b) => BADGE_LABELS[b.kind] ?? b.kind).join(" · ") || "No badges"}
                        {p.versions > 1 ? ` · revised ${p.versions - 1} time${p.versions === 2 ? "" : "s"}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {active.length ? (
              <p className="border-t border-stroke px-5 py-3 text-[12.5px] text-ink-muted">
                Proposals stay firm until they expire or are withdrawn. Connection fee payments aren&apos;t switched on yet, so accepting charges nothing for now.
              </p>
            ) : null}
          </Card>
          <Card>
            <CardHeader title="What providers see" />
            <CardBody className="pt-0">
              <JobSummary job={pub} fileLinks={links} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Private until engagement" description="Only the provider you engage will see these" />
            <CardBody className="pt-0">
              <dl className="grid grid-cols-1 gap-3 text-[14px] sm:grid-cols-2">
                <div>
                  <dt className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                    <Lock className="size-3.5" aria-hidden /> Exact address
                  </dt>
                  <dd>{job.address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                    <Lock className="size-3.5" aria-hidden /> Site access and safety
                  </dt>
                  <dd className="whitespace-pre-wrap">{job.site_access_notes ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] text-ink-subtle">Your name shown to providers</dt>
                  <dd>{job.show_poster_name ? "Yes" : "No (shown as customer type and region)"}</dd>
                </div>
                {files.some((f) => !f.shared) ? (
                  <div>
                    <dt className="flex items-center gap-1 text-[12.5px] text-ink-subtle">
                      <Lock className="size-3.5" aria-hidden /> Unshared files
                    </dt>
                    <dd>
                      {files
                        .filter((f) => !f.shared)
                        .map((f) => (
                          <a key={f.id} href={links.get(f.path)} target="_blank" rel="noreferrer" className="mr-3 text-link hover:underline">
                            {f.file_name}
                          </a>
                        ))}
                    </dd>
                  </div>
                ) : null}
                {job.work_order_id ? (
                  <div>
                    <dt className="text-[12.5px] text-ink-subtle">Work order</dt>
                    <dd>
                      <Link href={`/customer/${orgId}/work-orders/${job.work_order_id}`} className="text-link hover:underline">
                        {job.work_order ? `${formatWorkOrderNumber(job.work_order.number)} · ${job.work_order.title}` : "Open"}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {job.cancel_reason ? (
                  <div>
                    <dt className="text-[12.5px] text-ink-subtle">Withdrawn</dt>
                    <dd>
                      {dmy(job.cancelled_at)}: {job.cancel_reason}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Questions" description="Private with each provider" />
          <CardBody className="flex flex-col gap-5 pt-0">
            {threads.length === 0 ? <p className="text-[13.5px] text-ink-muted">No questions yet.</p> : null}
            {threads.map((pid) => (
              <div key={pid} className="flex flex-col gap-2 border-t border-stroke pt-4 first:border-0 first:pt-0">
                <p className="text-[14px] font-semibold text-ink">{providerName.get(pid) ?? "Provider"}</p>
                <MessageThread
                  jobId={job.id}
                  providerId={pid}
                  portalPath={`/customer/${orgId}`}
                  canSend={open && (canPost || can(ctx.capabilities, "marketplace.accept"))}
                  placeholder="Reply"
                  messages={messages
                    .filter((m) => m.provider_id === pid)
                    .map((m) => ({
                      id: m.id,
                      mine: !m.from_provider,
                      who: m.from_provider ? (providerName.get(pid) ?? "Provider") : (names.get(m.sender_id) ?? "You"),
                      body: m.body,
                      when: formatDateTimeAU(new Date(m.created_at), ctx.timezone),
                      masked: m.masked,
                      clarification: m.is_clarification,
                    }))}
                />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
