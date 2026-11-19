import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Briefcase, Building2, CircleDollarSign, Gavel, Handshake, Star, Store, Timer, Truck, Wrench } from "lucide-react";
import { DEFAULT_PRICING, formatAud } from "@hvems/domain";
import { PageHeader, StatCard } from "@/components/shell/page";
import { Card, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Console" };

type CompanyRow = { id: string; name: string; equipment: { count: number }[] };

/**
 * Super Admin dashboard (spec ADM-09), kept to the key figures. Fleet figures
 * need the Super Admin's read access to every company's fleet (decision O-05).
 */
export default async function AdminHome() {
  const db = await createSupabaseServerClient();
  const superAdmin = (await getStaffContext())?.role === "platform_administrator";
  const orgCount = async (kind: string) => (await db.from("organisations").select("id", { count: "exact", head: true }).eq("kind", kind)).count ?? 0;
  const currentAssets = () => db.from("assets").select("id", { count: "exact", head: true }).is("archived_at", null);

  const [companies, customers, providers] = await Promise.all([orgCount("company"), orgCount("marketplace_customer"), orgCount("provider")]);
  const fleet = superAdmin
    ? await Promise.all([
        currentAssets().then((r) => r.count ?? 0),
        db
          .from("assets")
          .select("id, asset_classes!inner(category)", { count: "exact", head: true })
          .is("archived_at", null)
          .eq("asset_classes.category", "vehicle")
          .then((r) => r.count ?? 0),
        currentAssets().eq("condition", "out_of_service").then((r) => r.count ?? 0),
        db
          .from("organisations")
          .select("id, name, equipment:assets(count)")
          .eq("kind", "company")
          .is("equipment.archived_at", null)
          .limit(1000)
          .then((r) => (r.data ?? []) as unknown as CompanyRow[]),
      ])
    : null;

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of platform activity across HVEMS" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Companies" value={companies} icon={<Building2 />} href="/admin/organisations?kind=company" />
        <StatCard label="Marketplace customers" value={customers} icon={<Store />} href="/admin/organisations?kind=marketplace_customer" />
        <StatCard label="Providers" value={providers} icon={<Wrench />} href="/admin/organisations?kind=provider" />
      </div>
      <MarketplaceSection />
      {fleet ? <FleetSection fleet={fleet} /> : null}
    </>
  );
}

function FleetSection({ fleet: [total, vehicles, outOfService, companies] }: { fleet: [number, number, number, CompanyRow[]] }) {
  const free = DEFAULT_PRICING.fleetFreeAssets;
  const rows = companies
    .map((c) => ({ id: c.id, name: c.name, assets: c.equipment[0]?.count ?? 0 }))
    .filter((r) => r.assets > 0)
    .sort((a, b) => b.assets - a.assets || a.name.localeCompare(b.name));
  const monthly = rows.reduce((sum, r) => sum + Math.max(r.assets - free, 0), 0) * DEFAULT_PRICING.fleetPerAssetCents;

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Registered equipment" value={total} sub={`${vehicles} vehicles · ${total - vehicles} equipment`} icon={<Truck />} />
        <StatCard label="Out of service" value={outOfService} icon={<AlertTriangle />} tone={outOfService ? "red" : "neutral"} />
        <StatCard label="Fleet subscriptions" value={`${formatAud(monthly)} / month`} sub="Estimate at today's counts" icon={<CircleDollarSign />} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Largest fleets" />
        {rows.length === 0 ? (
          <EmptyState title="No equipment registered yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Company</TH>
                <TH className="text-right">Equipment</TH>
              </tr>
            </THead>
            <tbody>
              {rows.slice(0, 10).map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold">
                    <Link href={`/admin/organisations/${r.id}?tab=equipment`} className="hover:text-brand-ink hover:underline">
                      {r.name}
                    </Link>
                  </TD>
                  <TD className="text-right">{r.assets}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

type Platform = {
  days: number;
  jobs_posted: number;
  jobs_by_region: Record<string, number>;
  proposals_per_job: number | null;
  first_proposal_minutes: Record<string, number> | null;
  engagements: number;
  acceptance_rate: number | null;
  cancellations: number;
  no_shows: number;
  reviews: { count: number; average: number | null };
  fees_recorded_cents: number;
  verification_backlog: number;
  open_cases: number;
  verified_providers: number;
  open_critical_defects: number;
  inspections: number;
};

/** Marketplace performance for HVEMS (RPT-07, ADM-09), last 30 days. Safety figures are counts only. */
async function MarketplaceSection() {
  const db = await createSupabaseServerClient();
  const { data } = await db.rpc("platform_dashboard" as never, { p_days: 30 } as never);
  const d = data as unknown as Platform | null;
  if (!d) return null;
  const mins = (m: number | undefined) => (m === undefined || m === null ? "—" : m < 120 ? `${m} min` : `${Math.round(m / 60)} h`);
  return (
    <>
      <h2 className="mt-6 mb-3 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Marketplace, last {d.days} days</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Jobs posted" value={d.jobs_posted} sub={`${d.proposals_per_job ?? 0} proposals per job`} icon={<Briefcase />} />
        <StatCard
          label="Time to first proposal"
          value={mins(d.first_proposal_minutes?.standard)}
          sub={`Urgent: ${mins(d.first_proposal_minutes?.urgent)} (median)`}
          icon={<Timer />}
        />
        <StatCard label="Engagements" value={d.engagements} sub={`${d.acceptance_rate ?? 0}% of closed jobs engaged`} icon={<Handshake />} />
        <StatCard label="Cancellations · no-shows" value={`${d.cancellations} · ${d.no_shows}`} icon={<AlertTriangle />} tone={d.no_shows ? "amber" : "neutral"} />
        <StatCard label="Reviews" value={d.reviews.count} sub={d.reviews.average ? `Average ${d.reviews.average} of 5` : "No reviews yet"} icon={<Star />} />
        <StatCard label="Connection fees recorded" value={formatAud(d.fees_recorded_cents)} sub="Not collected until billing is live" icon={<CircleDollarSign />} />
        <StatCard label="Verification backlog" value={d.verification_backlog} sub={`${d.verified_providers} verified providers`} icon={<BadgeCheck />} tone={d.verification_backlog ? "amber" : "neutral"} href="/admin/verification" />
        <StatCard label="Open cases" value={d.open_cases} icon={<Gavel />} tone={d.open_cases ? "amber" : "neutral"} href="/admin/cases" />
      </div>
      {Object.keys(d.jobs_by_region ?? {}).length ? (
        <Card className="mt-4">
          <CardHeader title="Jobs by region" />
          <Table>
            <tbody>
              {Object.entries(d.jobs_by_region)
                .sort((a, b) => b[1] - a[1])
                .map(([r, n]) => (
                  <TR key={r}>
                    <TD>{r}</TD>
                    <TD className="text-right">{n}</TD>
                  </TR>
                ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
      <p className="mt-3 text-[12.5px] text-ink-subtle">
        Across all companies: {d.inspections} pre-starts in the period; {d.open_critical_defects} open Critical defects (counts only). Revenue for the GST threshold appears once billing is live.
      </p>
    </>
  );
}
