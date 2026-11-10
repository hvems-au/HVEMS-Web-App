import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Building2, CheckCircle2, MapPin, Plus, Truck, Upload, Users } from "lucide-react";
import { getAssetConditionCounts, listAssets, listClients, listMembers, listSites } from "@hvems/api-client";
import { fleetSubscriptionCents, formatAud, monthlyWaiverAllowance } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { ConditionBadge } from "@/components/condition";
import { PageHeader, StatCard } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MODULE_INFO } from "@/lib/navigation";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  if (ctx.context.kind === "marketplace_customer") return <MarketplaceCustomerDashboard orgId={orgId} name={ctx.context.organisation_name} />;

  const db = await createSupabaseServerClient();
  const canAssets = can(ctx.capabilities, "assets.view") || can(ctx.capabilities, "assets.view_permitted");
  const [counts, attention, clients, sites, members] = await Promise.all([
    canAssets ? getAssetConditionCounts(db, orgId) : Promise.resolve({ total: 0, active: 0, needs_attention: 0, out_of_service: 0 }),
    canAssets ? listAssets(db, { organisationId: orgId, pageSize: 50 }) : Promise.resolve({ rows: [], total: 0 }),
    can(ctx.capabilities, "clients.view") ? listClients(db, orgId) : Promise.resolve([]),
    can(ctx.capabilities, "sites.view") ? listSites(db, orgId) : Promise.resolve([]),
    listMembers(db, orgId),
  ]);
  const flagged = attention.rows.filter((a) => a.condition !== "active").slice(0, 6);
  const base = `/customer/${orgId}`;
  const canBilling = can(ctx.capabilities, "org.billing.view");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your HVEMS operations"
        actions={
          can(ctx.capabilities, "assets.manage") ? (
            <>
              {can(ctx.capabilities, "assets.import_archive") ? (
                <Button asChild variant="secondary">
                  <Link href={`${base}/equipment/import`}>
                    <Upload /> Import
                  </Link>
                </Button>
              ) : null}
              <Button asChild>
                <Link href={`${base}/equipment/new`}>
                  <Plus /> New Equipment
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered assets" value={counts.total} sub="Current vehicles and equipment" icon={<Truck />} href={`${base}/equipment`} />
        <StatCard label="Active" value={counts.active} sub="No open defects or holds" icon={<CheckCircle2 />} tone="green" href={`${base}/equipment?condition=active`} />
        <StatCard label="Needs attention" value={counts.needs_attention} sub="Minor defects or holds" icon={<AlertTriangle />} tone="amber" href={`${base}/equipment?condition=needs_attention`} />
        <StatCard label="Broken/Out of service" value={counts.out_of_service} sub="Do not operate" icon={<AlertOctagon />} tone="red" href={`${base}/equipment?condition=out_of_service`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Assets needing attention"
            description="Condition is set automatically from open defects and holds"
            action={
              <Link href={`${base}/equipment`} className="text-[12px] font-medium text-link hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="px-0 pb-1">
            {flagged.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title={counts.total === 0 ? "No equipment yet" : "No assets need attention"}>
                {counts.total === 0
                  ? "Add your first vehicle or piece of equipment, or import your register from a CSV file."
                  : "Assets will appear here when a defect or hold is recorded (increment 2B)."}
              </EmptyState>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Equipment ID</TH>
                    <TH>Equipment</TH>
                    <TH>Site</TH>
                    <TH>Condition</TH>
                  </tr>
                </THead>
                <tbody>
                  {flagged.map((a) => (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`${base}/equipment/${a.id}`} className="font-semibold text-brand underline underline-offset-2">
                          {a.asset_number}
                        </Link>
                      </TD>
                      <TD>
                        {[a.make, a.model].filter(Boolean).join(" ") || "—"}
                        <span className="block text-[12px] text-ink-subtle">{a.asset_class?.name}</span>
                      </TD>
                      <TD>{a.site?.name ?? "—"}</TD>
                      <TD>
                        <ConditionBadge condition={a.condition} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Organisation" />
            <CardBody className="grid grid-cols-3 gap-3 text-center">
              <Link href={`${base}/clients`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-[#ececef]">
                <Building2 className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{clients.length}</p>
                <p className="text-[12px] text-ink-muted">Clients</p>
              </Link>
              <Link href={`${base}/clients?tab=sites`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-[#ececef]">
                <MapPin className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{sites.length}</p>
                <p className="text-[12px] text-ink-muted">Sites</p>
              </Link>
              <Link href={`${base}/team`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-[#ececef]">
                <Users className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{members.length}</p>
                <p className="text-[12px] text-ink-muted">Members</p>
              </Link>
            </CardBody>
          </Card>
          {canBilling ? (
            <Card>
              <CardHeader title="Fleet subscription" description="Estimate at today's count. Billed monthly in arrears on the highest count." />
              <CardBody>
                <p className="text-[26px] font-bold text-ink">
                  {formatAud(fleetSubscriptionCents(counts.total))}
                  <span className="text-[14px] font-medium text-ink-subtle"> / month</span>
                </p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  First five assets free · $30 per additional asset · {monthlyWaiverAllowance(counts.total)} company-side connection-fee waiver(s) per
                  month once assets have been current for 14 days.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Coming in the next increments" description="These modules are part of Stage 2 and are being delivered in order." />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["inspections", "defects", "maintenance", "work-orders", "parts", "reports", "marketplace", "notifications"] as const).map((k) => {
            const m = MODULE_INFO[k]!;
            return (
              <div key={k} className="rounded-[10px] border border-dashed border-stroke p-3">
                <p className="flex items-center justify-between text-[14px] font-semibold text-ink">
                  {m.title} <span className="rounded bg-surface-muted px-1.5 text-[11px] text-ink-muted">{m.increment}</span>
                </p>
                <p className="mt-1 text-[12.5px] text-ink-muted">{m.scope}</p>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </>
  );
}

function MarketplaceCustomerDashboard({ orgId, name }: { orgId: string; name: string }) {
  return (
    <>
      <PageHeader title="Dashboard" description={`${name} · Marketplace-only customer`} />
      <Card>
        <EmptyState
          icon={<Truck />}
          title="Post a job when you need a breakdown repair, urgent repair or service"
          action={
            <Button asChild>
              <Link href={`/customer/${orgId}/module/jobs`}>About marketplace jobs</Link>
            </Button>
          }
        >
          Job posting, proposals and engagements are delivered in increment 2D. Your account, team and audit history are ready now. Marketplace-only
          accounts have no fleet subscription.
        </EmptyState>
      </Card>
    </>
  );
}
