import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Briefcase, CreditCard, Users } from "lucide-react";
import { browseMarketplaceJobs, getOrganisation, getProviderProfile, listMembers } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { VERIFICATION_STATUS } from "@/features/marketplace/labels";
import { DEFAULT_PRICING, formatAbn, formatAud } from "@hvems/domain";
import { PageHeader, StatCard } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Provider dashboard" };

export default async function ProviderDashboard({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["provider"]);
  const db = await createSupabaseServerClient();
  const [org, members, profile, jobs] = await Promise.all([
    getOrganisation(db, orgId),
    listMembers(db, orgId),
    getProviderProfile(db, orgId).catch(() => null),
    can(ctx.capabilities, "provider.jobs.browse") ? browseMarketplaceJobs(db, orgId).catch(() => []) : Promise.resolve([]),
  ]);
  const vs = VERIFICATION_STATUS[profile?.status ?? "draft"];
  const matching = jobs.filter((j) => j.matches).length;
  const base = `/provider/${orgId}`;
  return (
    <>
      <PageHeader title="Dashboard" description={`${org.name}${org.abn ? ` · ABN ${formatAbn(org.abn)}` : ""}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Verification" value={vs.label} sub={profile?.status === "verified" ? "Badges on your profile" : "Required before proposing"} icon={<BadgeCheck />} tone={profile?.status === "verified" ? "green" : "amber"} href={`${base}/verification`} />
        <StatCard label="Team members" value={members.length} sub="Managers and technicians" icon={<Users />} href={`${base}/team`} />
        <StatCard label="Open jobs" value={jobs.length} sub={`${matching} match your services and regions`} icon={<Briefcase />} href={`${base}/jobs`} />
        <StatCard label="Subscription" value={formatAud(DEFAULT_PRICING.providerSubscriptionCents)} sub="per month, from verification" icon={<CreditCard />} href={`${base}/module/billing`} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Getting ready to quote" />
        <CardBody>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-ink-muted">
            <li>
              Add your team under <Link href={`${base}/team`} className="text-link hover:underline">Team</Link>. Provider Managers find jobs; Provider Technicians work on assigned engagements.
            </li>
            <li>
              Complete <Link href={`${base}/verification`} className="text-link hover:underline">Profile &amp; verification</Link>: your services and area, public liability insurance and any qualifications. HVEMS checks your ABN by hand.
            </li>
            <li>Save a card for connection fees ($29 standard, $49 urgent per accepted job) and start submitting proposals (increment 2D).</li>
          </ol>
          <p className="mt-4 text-[13px] text-ink-subtle">
            Founding providers verified before public launch, or within 90 days after it, pay no subscription for their first three months.
          </p>
        </CardBody>
      </Card>
      <Card className="mt-5">
        <CardHeader title="Need work done on your own equipment?" />
        <CardBody>
          <p className="text-[14px] text-ink-muted">
            Provider accounts quote for jobs; they don&apos;t post them. To post a job, open a marketplace customer account with the same
            login and switch between the two from the account menu. Each keeps its own records.
          </p>
          <Link href="/onboarding?kind=marketplace_customer" className="mt-3 inline-block text-[14px] font-semibold text-link hover:underline">
            Open a customer account
          </Link>
        </CardBody>
      </Card>
    </>
  );
}
