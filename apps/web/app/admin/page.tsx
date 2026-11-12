import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, CircleDollarSign, Store, Truck, Wrench } from "lucide-react";
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
