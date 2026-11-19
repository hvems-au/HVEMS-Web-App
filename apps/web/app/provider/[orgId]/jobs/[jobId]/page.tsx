import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getJobForProvider, getMyProposal, getPersonNames, listMarketplaceMessages, signMarketplaceFiles, type PublicJob } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { JobSummary } from "@/features/marketplace/job-summary";
import { PROPOSAL_STATUS, availabilityText, priceText } from "@/features/marketplace/labels";
import { MessageThread } from "@/features/marketplace/message-thread";
import { SaveJobButton, WithdrawProposalButton } from "@/features/marketplace/provider-controls";
import { ProposalForm } from "@/features/marketplace/proposal-form";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job" };

/** A job as a provider sees it: public details, private questions, and the provider's proposal (MKT-04/08/09). */
export default async function ProviderJobPage({ params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  const ctx = await loadOrgContext(orgId, ["provider"]);
  if (!can(ctx.capabilities, "provider.jobs.browse")) notFound();
  const canPropose = can(ctx.capabilities, "provider.proposals.manage");
  const db = await createSupabaseServerClient();
  const job: PublicJob | null = await getJobForProvider(db, orgId, jobId).catch(() => null);
  if (!job) notFound();
  const [mine, messages, links, validity] = await Promise.all([
    getMyProposal(db, orgId, jobId),
    listMarketplaceMessages(db, jobId, orgId),
    signMarketplaceFiles(
      db,
      job.files.map((f) => f.path),
    ),
    db.from("platform_settings").select("key, value").in("key", ["marketplace.proposal_validity_default_hours", "marketplace.urgent_proposal_validity_default_minutes"]),
  ]);
  const setting = (k: string, d: number) => Number(validity.data?.find((r) => r.key === k)?.value ?? d) || d;
  const validityDefault = job.urgency === "urgent" ? setting("marketplace.urgent_proposal_validity_default_minutes", 60) : setting("marketplace.proposal_validity_default_hours", 72) * 60;
  const names = await getPersonNames(db, [...new Set(messages.filter((m) => m.from_provider).map((m) => m.sender_id))]);
  const open = job.status === "open";
  const current = mine?.versions[0] ?? null;
  const editable = !mine || ["active", "withdrawn", "expired"].includes(mine.status);
  const status = mine ? PROPOSAL_STATUS[mine.status] : null;

  return (
    <>
      <PageHeader
        title={job.title}
        description={`Job ${job.number}`}
        breadcrumb={{ label: "Browse jobs", href: `/provider/${orgId}/jobs` }}
        actions={open ? <SaveJobButton providerId={orgId} jobId={job.id} saved={!!job.saved} /> : null}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card>
            <CardBody>
              <JobSummary job={job} fileLinks={links} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={mine ? "Your proposal" : "Submit a proposal"} action={status ? <Badge tone={status.tone}>{status.label}</Badge> : null} />
            <CardBody className="flex flex-col gap-4 pt-0">
              {current ? (
                <div className="rounded-[10px] border border-stroke p-3.5 text-[14px]">
                  <p className="font-semibold text-ink">{priceText(current)}</p>
                  <p className="text-ink-muted">
                    {availabilityText(current)} · valid until {formatDateTimeAU(new Date(mine!.valid_until), ctx.timezone)} · version {current.version}
                  </p>
                  {mine && mine.status === "active" && canPropose ? (
                    <div className="mt-2">
                      <WithdrawProposalButton providerId={orgId} proposalId={mine.id} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {job.block ? (
                <p className="flex items-start gap-2 rounded-[10px] border border-warn-line bg-warn-soft p-3 text-[14px] text-warn-ink">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {job.block}. You can view jobs and ask questions, but not propose.
                </p>
              ) : !open ? (
                <p className="text-[14px] text-ink-muted">This job is no longer taking proposals.</p>
              ) : !canPropose ? (
                <p className="text-[14px] text-ink-muted">Ask your Provider Owner or Manager to propose.</p>
              ) : editable ? (
                <ProposalForm providerId={orgId} jobId={job.id} urgent={job.urgency === "urgent"} feeCents={job.fee_cents} defaults={current} validityDefaultMinutes={validityDefault} />
              ) : null}
              {mine && mine.versions.length > 1 ? (
                <details className="text-[13.5px]">
                  <summary className="cursor-pointer text-ink-muted">Earlier versions ({mine.versions.length - 1})</summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {mine.versions.slice(1).map((v) => (
                      <li key={v.id} className="text-ink-muted">
                        v{v.version}: {priceText(v)} · {availabilityText(v)} · {formatDateTimeAU(new Date(v.created_at), ctx.timezone)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Questions" description="Private between you and the customer" />
          <CardBody className="pt-0">
            <MessageThread
              jobId={job.id}
              providerId={orgId}
              portalPath={`/provider/${orgId}`}
              canSend={open}
              messages={messages.map((m) => ({
                id: m.id,
                mine: m.from_provider,
                who: m.from_provider ? (names.get(m.sender_id) ?? "Your team") : job.poster,
                body: m.body,
                when: formatDateTimeAU(new Date(m.created_at), ctx.timezone),
                masked: m.masked,
                clarification: m.is_clarification,
              }))}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
