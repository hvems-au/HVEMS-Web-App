import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isTechnicianOnly } from "@/lib/shell-data";
import { AlertOctagon, AlertTriangle, Briefcase, Building2, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Handshake, MapPin, Plus, Truck, Upload, Users, Wrench } from "lucide-react";
import { getAssetConditionCounts, getDashboardTodo, listAssets, listClients, listEngagements, listExpenditure, listMarketplaceJobs, listMembers, listSites } from "@hvems/api-client";
import { startOfDayInZone, todayISO } from "@hvems/domain";
import { ConvertToCompanyButton } from "@/features/marketplace/convert-button";
import { effectiveJobStatus } from "@/features/marketplace/labels";
import { buildCompliance } from "@/features/reports/compliance";
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
  if (ctx.context.kind === "marketplace_customer")
    return <MarketplaceCustomerDashboard orgId={orgId} name={ctx.context.organisation_name} canConvert={ctx.context.role === "account_owner"} />;
  // Technicians start on their own jobs (managers keep the fleet dashboard; My Jobs is in the menu).
  if (isTechnicianOnly(ctx)) redirect(`/customer/${orgId}/my-work`);

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
  // RPT-01: inspection completion and cost this month, and marketplace activity; each tile opens its list.
  const today = todayISO(ctx.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const seesCost = can(ctx.capabilities, "assets.costs.view");
  const seesMarket = can(ctx.capabilities, "marketplace.post") || can(ctx.capabilities, "marketplace.accept");
  const [month, monthCost, mJobs, mEngagements] = await Promise.all([
    can(ctx.capabilities, "reports.view") ? buildCompliance(db, orgId, ctx.timezone, monthStart, today).catch(() => null) : Promise.resolve(null),
    seesCost ? listExpenditure(db, orgId, { from: startOfDayInZone(monthStart, ctx.timezone).toISOString() }).catch(() => []) : Promise.resolve([]),
    seesMarket ? listMarketplaceJobs(db, orgId).catch(() => []) : Promise.resolve([]),
    seesMarket ? listEngagements(db, { posterId: orgId }).catch(() => []) : Promise.resolve([]),
  ]);
  const openJobs = mJobs.filter((j) => effectiveJobStatus(j) === "open").length;
  const liveEngagements = mEngagements.filter((e) => ["confirmed", "on_my_way", "on_site", "completed", "correction_requested", "no_show_reported"].includes(e.status)).length;
  const todoItems = [
    { n: todo.criticalDefects, label: "Critical defects", href: `/customer/${orgId}/defects`, tone: "red" as const },
    { n: todo.minorDefects, label: "Minor defects", href: `/customer/${orgId}/defects`, tone: "amber" as const },
    { n: todo.advisoryDefects, label: "Advisory defects", href: `/customer/${orgId}/defects`, tone: "blue" as const },
    { n: can(ctx.capabilities, "meter_readings.accept") ? todo.pendingReadings : 0, label: "Readings to approve", href: `/customer/${orgId}/equipment/readings`, tone: "amber" as const },
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Registered assets" value={counts.total} sub="Current vehicles and equipment" icon={<Truck />} href={`${base}/equipment`} />
        <StatCard label="Active" value={counts.active} sub="No open defects or holds" icon={<CheckCircle2 />} tone="green" href={`${base}/equipment?condition=active`} />
        <StatCard label="Needs attention" value={counts.needs_attention} sub="Minor defects or holds" icon={<AlertTriangle />} tone="amber" href={`${base}/equipment?condition=needs_attention`} />
        <StatCard label="Broken/Out of service" value={counts.out_of_service} sub="Do not operate" icon={<AlertOctagon />} tone="red" href={`${base}/equipment?condition=out_of_service`} />
        <StatCard
          label="Open defects"
          value={todo.criticalDefects + todo.minorDefects + todo.advisoryDefects}
          sub={[`${todo.criticalDefects} critical`, todo.minorDefects ? `${todo.minorDefects} minor` : null, `${todo.advisoryDefects} advisory`].filter(Boolean).join(" · ")}
          icon={<Wrench />}
          tone={todo.criticalDefects ? "red" : todo.minorDefects + todo.advisoryDefects ? "amber" : "green"}
          href={`${base}/defects`}
        />
      </div>

      {month || seesCost || seesMarket ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {month ? (
            <StatCard
              label="Pre-starts this month"
              value={month.inspections.completion === null ? "—" : `${month.inspections.completion}%`}
              sub={`${month.inspections.done} done of ${month.inspections.expected} expected`}
              icon={<ClipboardCheck />}
              tone={month.inspections.completion !== null && month.inspections.completion < 90 ? "amber" : "neutral"}
              href={`${base}/reports/compliance`}
            />
          ) : null}
          {seesCost ? (
            <StatCard
              label="Maintenance cost this month"
              value={formatAud(monthCost.reduce((sum, c) => sum + c.amount_cents, 0))}
              sub="Parts, labour, outside work and fuel"
              icon={<CircleDollarSign />}
              href={`${base}/costs?from=${monthStart}`}
            />
          ) : null}
          {seesMarket ? (
            <>
              <StatCard label="Marketplace jobs open" value={openJobs} icon={<Briefcase />} href={`${base}/marketplace?status=open`} />
              <StatCard label="Engagements in progress" value={liveEngagements} icon={<Handshake />} href={`${base}/engagements`} />
            </>
          ) : null}
        </div>
      ) : null}

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

async function MarketplaceCustomerDashboard({ orgId, name, canConvert }: { orgId: string; name: string; canConvert: boolean }) {
  const db = await createSupabaseServerClient();
  const [jobs, engagements] = await Promise.all([listMarketplaceJobs(db, orgId).catch(() => []), listEngagements(db, { posterId: orgId }).catch(() => [])]);
  const open = jobs.filter((j) => effectiveJobStatus(j) === "open");
  const proposals = open.reduce((n, j) => n + (j.proposals?.[0]?.count ?? 0), 0);
  const live = engagements.filter((e) => ["confirmed", "on_my_way", "on_site", "completed", "correction_requested", "no_show_reported"].includes(e.status));
  const toConfirm = engagements.filter((e) => e.status === "completed").length;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${name} · Marketplace-only customer`}
        actions={
          <Button asChild>
            <Link href={`/customer/${orgId}/marketplace/new`}>
              <Plus /> Post a job
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open jobs" value={open.length} sub={`${proposals} proposal${proposals === 1 ? "" : "s"} to compare`} icon={<Briefcase />} href={`/customer/${orgId}/marketplace?status=open`} />
        <StatCard label="Engagements in progress" value={live.length} icon={<Handshake />} href={`/customer/${orgId}/engagements`} />
        <StatCard label="Completed work to confirm" value={toConfirm} icon={<CheckCircle2 />} tone={toConfirm ? "amber" : "neutral"} href={`/customer/${orgId}/engagements`} />
      </div>
      {canConvert ? (
        <Card className="mt-5">
          <CardHeader title="Running your own fleet?" />
          <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-0">
            <p className="max-w-[620px] text-[14px] text-ink-muted">
              Convert this account to a company to manage your vehicles and equipment: pre-starts, defects, maintenance and work orders. Your past jobs and
              engagements stay with you, and the equipment you described on jobs can become managed equipment. The first five pieces of equipment are free.
            </p>
            <ConvertToCompanyButton orgId={orgId} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
