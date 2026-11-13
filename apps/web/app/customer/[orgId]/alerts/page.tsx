import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, FileWarning, Hand, OctagonAlert, TriangleAlert, UserX, Wrench, IdCard, LifeBuoy, ClipboardX, Gauge } from "lucide-react";
import { listCriticalAlerts, listMembers, listMyNotifications } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import type { NotificationKind } from "@hvems/types";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AcknowledgeButton } from "./acknowledge-button";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Alerts" };

const KIND: Record<NotificationKind, { icon: typeof OctagonAlert; tone: string }> = {
  critical_defect: { icon: OctagonAlert, tone: "text-danger" },
  minor_defect: { icon: TriangleAlert, tone: "text-warn-ink" },
  operator_not_fit: { icon: UserX, tone: "text-danger" },
  out_of_service_hold: { icon: Hand, tone: "text-danger" },
  needs_attention_hold: { icon: Hand, tone: "text-warn-ink" },
  breakdown: { icon: Wrench, tone: "text-danger" },
  regulator_notice: { icon: FileWarning, tone: "text-warn-ink" },
  alert_escalated: { icon: BellRing, tone: "text-danger" },
  credential_expiring: { icon: IdCard, tone: "text-warn-ink" },
  credential_expired: { icon: IdCard, tone: "text-danger" },
  support_access_started: { icon: LifeBuoy, tone: "text-info-ink" },
  prestart_missed: { icon: ClipboardX, tone: "text-warn-ink" },
  meter_reading_review: { icon: Gauge, tone: "text-warn-ink" },
};
const ESCALATION = ["", "Escalated: 30 min", "Escalated: 2 hours"] as const;

/**
 * Critical alerts (one per Out-of-service event) must be acknowledged by the
 * Owner, a Company Admin or a Fleet Manager; unacknowledged alerts escalate at
 * 30 minutes and 2 hours (settings). Below: this person's own alert feed.
 */
export default async function AlertsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const canAck = can(ctx.capabilities, "defects.triage");
  const [rows, alerts, members] = await Promise.all([
    listMyNotifications(db, orgId, 100),
    canAck ? listCriticalAlerts(db, orgId, 50) : Promise.resolve([]),
    canAck ? listMembers(db, orgId).catch(() => []) : Promise.resolve([]),
  ]);
  const unread = rows.filter((r) => !r.read_at).length;
  const open = alerts.filter((a) => !a.acknowledged_at);
  const recent = alerts.filter((a) => a.acknowledged_at).slice(0, 10);
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile?.full_name || "—";
  const tz = ctx.timezone;

  return (
    <>
      <PageHeader title="Alerts" description="Critical alerts need acknowledging, or they escalate." actions={unread ? <MarkAllRead orgId={orgId} /> : null} />

      {canAck ? (
        <Card className="mb-5">
          <CardHeader title={`Critical alerts waiting for acknowledgement (${open.length})`} description="Acknowledging tells everyone someone is dealing with it. It doesn't clear the equipment." />
          {open.length === 0 ? (
            <EmptyState title="Nothing waiting">Critical faults, Out-of-service holds, breakdowns and Major defect notices appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-stroke">
              {open.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 bg-danger-soft px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <OctagonAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-semibold text-ink">{a.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-subtle">
                        Raised {formatDateTimeAU(new Date(a.raised_at), tz)}
                        {a.escalation_level ? <Badge tone="red">{ESCALATION[a.escalation_level]}</Badge> : null}
                        <Link href={`/customer/${orgId}/equipment/${a.asset_id}`} className="font-semibold text-link hover:underline">
                          Open {a.asset?.asset_number ?? "equipment"}
                        </Link>
                      </p>
                    </div>
                  </div>
                  <AcknowledgeButton orgId={orgId} alertId={a.id} />
                </li>
              ))}
            </ul>
          )}
          {recent.length ? (
            <div className="border-t border-stroke px-5 py-3">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Recently acknowledged</p>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-muted">
                {recent.map((a) => (
                  <li key={a.id}>
                    {a.title} · acknowledged by {nameOf(a.acknowledged_by)} {formatDateTimeAU(new Date(a.acknowledged_at!), tz)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your alerts" />
        {rows.length === 0 ? (
          <EmptyState title="No alerts">You&apos;ll see faults, holds, breakdowns and defect notices here.</EmptyState>
        ) : (
          <ul className="divide-y divide-stroke">
            {rows.map((n) => {
              const k = KIND[n.kind];
              return (
                <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3.5", !n.read_at && "bg-brand-soft")}>
                  <k.icon className={cn("mt-0.5 size-5 shrink-0", k.tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[14.5px] text-ink", !n.read_at && "font-semibold")}>{n.title}</p>
                    {n.body ? <p className="text-[13.5px] text-ink-muted">{n.body}</p> : null}
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink-subtle">
                      {formatDateTimeAU(new Date(n.created_at), tz)}
                      {n.inspection_id ? (
                        <Link href={`/customer/${orgId}/inspections/${n.inspection_id}`} className="font-semibold text-link hover:underline">
                          View pre-start
                        </Link>
                      ) : null}
                      {n.asset_id ? (
                        <Link href={`/customer/${orgId}/equipment/${n.asset_id}`} className="font-semibold text-link hover:underline">
                          Open equipment
                        </Link>
                      ) : null}
                    </p>
                  </div>
                  {!n.read_at ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
