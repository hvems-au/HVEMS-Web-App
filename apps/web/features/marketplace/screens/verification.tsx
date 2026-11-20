import "server-only";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import {
  getOrganisation,
  getProviderProfile,
  listMarketplaceRegions,
  listProviderBadges,
  listProviderDocuments,
  marketplaceRpc,
  signProviderDocuments,
} from "@hvems/api-client";
import { formatAbn, formatDateTimeAU, todayISO } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { BADGE_LABELS, VERIFICATION_STATUS, dmy } from "@/features/marketplace/labels";
import { ProviderDocuments, SubmitVerificationButton } from "@/features/marketplace/provider-documents";
import { ProviderProfileForm } from "@/features/marketplace/provider-profile-form";
import { MarketplaceTabs } from "@/features/marketplace/marketplace-tabs";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The provider's profile, documents and verification (MKT-01..03). */
export async function VerificationScreen({ orgId, portal }: { orgId: string; portal: "provider" | "company" }) {
  const ctx = await loadOrgContext(orgId, portal === "provider" ? ["provider"] : ["company"]);
  const canEdit = can(ctx.capabilities, "provider.profile.manage");
  const canSubmit = can(ctx.capabilities, "provider.verification.submit");
  const db = await createSupabaseServerClient();
  const [org, profile, regions, docs, badges, block] = await Promise.all([
    getOrganisation(db, orgId),
    getProviderProfile(db, orgId),
    listMarketplaceRegions(db),
    listProviderDocuments(db, orgId),
    listProviderBadges(db, orgId),
    marketplaceRpc<string | null>(db, "provider_proposal_block", { p_organisation_id: orgId }).catch(() => null),
  ]);
  const links = await signProviderDocuments(
    db,
    docs.map((d) => d.path),
  );
  const status = VERIFICATION_STATUS[profile?.status ?? "draft"];
  const today = todayISO(ctx.timezone);

  return (
    <>
      <PageHeader
        title="Profile & verification"
        description={`${org.name}${org.abn ? ` · ABN ${formatAbn(org.abn)}` : ""}. HVEMS checks your ABN, insurance and qualifications before you can propose on jobs.`}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {portal === "company" ? (
        <MarketplaceTabs
          orgId={orgId}
          active="profile"
          canPost={can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept")}
          canProvide
        />
      ) : null}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Can you propose on jobs?" />
          <CardBody className="flex flex-col gap-3 pt-0">
            {block ? (
              <p className="flex items-start gap-2 rounded-[10px] border border-warn-line bg-warn-soft p-3 text-[14px] text-warn-ink">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {block}.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-[10px] border border-ok/40 bg-ok-soft p-3 text-[14px] text-ok-ink">
                <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> Yes: you&apos;re verified and your insurance is current.
              </p>
            )}
            {profile?.status === "rejected" && profile.decision_reason ? (
              <p className="text-[13.5px] text-ink-muted">
                <span className="font-medium text-ink">Reason given:</span> {profile.decision_reason}. Fix this and submit again.
              </p>
            ) : null}
            {profile?.status === "suspended" && profile.suspended_reason ? (
              <p className="text-[13.5px] text-danger-ink">Suspended: {profile.suspended_reason}</p>
            ) : null}
            <p className="text-[13px] text-ink-subtle">
              To submit you need your ABN, at least one service, a service area and a current public liability certificate. A subscription and a saved card for
              connection fees will also be needed once billing goes live.
            </p>
            {canSubmit && profile && ["draft", "rejected", "verified"].includes(profile.status) ? (
              <div>
                <SubmitVerificationButton orgId={orgId} />
                {profile.status === "verified" ? <p className="mt-1.5 text-[12.5px] text-ink-subtle">Submit again after uploading renewed insurance or new qualifications.</p> : null}
              </div>
            ) : null}
            {profile?.status === "submitted" ? (
              <p className="text-[13.5px] text-ink-muted">Sent {profile.submitted_at ? formatDateTimeAU(new Date(profile.submitted_at), ctx.timezone) : ""}. A Verification Officer will review it.</p>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Badges" description="What HVEMS checked, and when" />
          <CardBody className="pt-0">
            {badges.length === 0 ? (
              <p className="text-[13.5px] text-ink-muted">None yet. Badges appear when a Verification Officer approves your application.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {badges.map((b) => (
                  <li key={b.id} className="text-[13.5px]">
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      <BadgeCheck className="size-4 text-ok-ink" aria-hidden /> {BADGE_LABELS[b.kind] ?? b.kind}
                      {b.expires_on && b.expires_on < today ? <Badge tone="red">Expired</Badge> : null}
                    </span>
                    <span className="block text-ink-muted">{b.details}</span>
                    <span className="block text-[12px] text-ink-subtle">
                      Checked {dmy(b.checked_at)}
                      {b.expires_on ? ` · expires ${dmy(b.expires_on)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="mb-5">
        <CardHeader title="Documents" description="Public liability certificate (required), and qualifications or licences for the services you offer" />
        <CardBody className="pt-0">
          <ProviderDocuments
            orgId={orgId}
            canEdit={canEdit}
            today={today}
            docs={docs.map((d) => ({ id: d.id, kind: d.kind, category: d.category, title: d.title, fileName: d.file_name, expiresOn: d.expires_on, url: links.get(d.path) ?? null }))}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Profile" description="What customers see when comparing proposals, and which jobs you're alerted to" />
        <CardBody className="pt-0">
          <ProviderProfileForm orgId={orgId} profile={profile} regions={regions} canEdit={canEdit} />
        </CardBody>
      </Card>
    </>
  );
}
