import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Building2, CheckCircle2, ChevronRight, MapPin, Plus, Truck, Upload, Users } from "lucide-react";
import { getAssetConditionCounts, getDashboardTodo, listAssets, listClients, listMembers, listSites } from "@hvems/api-client";
import { fleetSubscriptionCents, formatAud, monthlyWaiverAllowance } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { ConditionBadge } from "@/components/condition";
import { ReadMore } from "@/components/read-more";
import { PageHeader, StatCard } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  if (ctx.context.kind === "marketplace_customer") return <MarketplaceCustomerDashboard orgId={orgId} name={ctx.context.organisation_name} />;

  const db = await createSupabaseServerClient();
  const canAssets = can(ctx.capabilities, "assets.view") || can(ctx.capabilities, "assets.view_permitted");
  const [counts, attention, clients, sites, members, todo] = await Promise.all([
    canAssets ? getAssetConditionCounts(db, orgId) : Promise.resolve({ total: 0, active: 0, needs_attention: 0, out_of_service: 0 }),
    canAssets ? listAssets(db, { organisationId: orgId, pageSize: 50 }) : Promise.resolve({ rows: [], total: 0 }),
    can(ctx.capabilities, "clients.view") ? listClients(db, orgId) : Promise.resolve([]),
    can(ctx.capabilities, "sites.view") ? listSites(db, orgId) : Promise.resolve([]),
    listMembers(db, orgId),
    getDashboardTodo(db, orgId),
  ]);
  const todoItems = [
    { n: todo.criticalDefects, label: "Critical defects", href: `/customer/${orgId}/defects`, tone: "red" as const },
    { n: todo.otherDefects, label: "Other open defects", href: `/customer/${orgId}/defects`, tone: "amber" as const },
    { n: todo.missedPrestarts, label: "Missed pre-starts to review", href: `/customer/${orgId}/inspections?tab=missed`, tone: "amber" as const },
    { n: todo.overdueServices, label: "Services overdue", href: `/customer/${orgId}/maintenance`, tone: "red" as const },
    { n: todo.dueSoonServices, label: "Services due soon", href: `/customer/${orgId}/maintenance`, tone: "amber" as const },
    { n: todo.workOrdersToReview, label: "Work orders to review", href: `/customer/${orgId}/work-orders`, tone: "amber" as const },
    { n: todo.openWorkOrders, label: "Open work orders", href: `/customer/${orgId}/work-orders`, tone: "blue" as const },
  ].filter((t) => t.n > 0);
  const flagged = attention.rows.filter((a) => a.condition !== "active").slice(0, 6);
  const base = `/customer/${orgId}`;
  const canBilling = can(ctx.capabilities, "org.billing.view");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your fleet at a glance"
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
                  <Plus /> Add equipment
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
            title="Equipment needing attention"
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
                  : "Equipment shows here when a defect or hold is recorded."}
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
                        <Link href={`${base}/equipment/${a.id}`} className="font-semibold text-brand-ink underline underline-offset-2">
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
            <CardHeader title="To do" />
            <CardBody className="px-0 py-1">
              {todoItems.length === 0 ? (
                <p className="flex items-center gap-2 px-5 py-3 text-[13.5px] text-ink-muted">
                  <CheckCircle2 className="size-4 text-ok" aria-hidden /> All caught up
                </p>
              ) : (
                <ul>
                  {todoItems.map((t) => (
                    <li key={t.label}>
                      <Link href={t.href} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px] hover:bg-surface-muted">
                        <Badge tone={t.tone} className="min-w-8 justify-center">
                          {t.n}
                        </Badge>
                        <span className="flex-1 text-ink">{t.label}</span>
                        <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Organisation" />
            <CardBody className="grid grid-cols-3 gap-3 text-center">
              <Link href={`${base}/clients`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-surface-hover">
                <Building2 className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{clients.length}</p>
                <p className="text-[12px] text-ink-muted">Clients</p>
              </Link>
              <Link href={`${base}/clients?tab=sites`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-surface-hover">
                <MapPin className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{sites.length}</p>
                <p className="text-[12px] text-ink-muted">Sites</p>
              </Link>
              <Link href={`${base}/team`} className="rounded-[10px] bg-surface-muted px-2 py-3 hover:bg-surface-hover">
                <Users className="mx-auto size-5 text-ink-muted" aria-hidden />
                <p className="mt-1 text-[20px] font-bold">{members.length}</p>
                <p className="text-[12px] text-ink-muted">Members</p>
              </Link>
            </CardBody>
          </Card>
          {canBilling ? (
            <Card>
              <CardHeader title="Fleet subscription" />
              <CardBody>
                <p className="text-[26px] font-bold text-ink">
                  {formatAud(fleetSubscriptionCents(counts.total))}
                  <span className="text-[14px] font-medium text-ink-subtle"> / month</span>
                </p>
                <ReadMore className="mt-1" summary="Estimate at today's count.">
                  First five assets are free, then $30 per asset a month. You&apos;re billed monthly in arrears on the month&apos;s highest count. You also get{" "}
                  {monthlyWaiverAllowance(counts.total)} connection-fee waiver(s) a month once assets have been current for 14 days.
                </ReadMore>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

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
