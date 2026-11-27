import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, ChevronDown, Mail, OctagonAlert, ShieldCheck } from "lucide-react";
import { listCriticalAlerts, listMembers, listMyNotifications } from "@hvems/api-client";
import { formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { notificationPath } from "@/lib/notification-links";
import { GROUP_LABEL, notificationKind, timeAgo, type NotificationGroup } from "@/lib/notification-kinds";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AcknowledgeButton } from "./acknowledge-button";
import { MarkAllRead } from "./mark-all-read";
import { NotificationList, type NotificationSection } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

const LIMIT = 200;
const ESCALATION = ["", "Escalated after 30 min", "Escalated after 2 hours"] as const;
/** The request time (a server component renders once per request). */
function nowMs() {
  return Date.now();
}

type Tab = "all" | "unread" | NotificationGroup;
const TABS: Tab[] = ["all", "unread", "safety", "maintenance", "marketplace", "account"];
const TAB_LABEL: Record<Tab, string> = { all: "All", unread: "Unread", ...GROUP_LABEL };

/**
 * Notifications: the critical alerts waiting for acknowledgement (Owner, Company Admin or
 * Fleet Manager; unacknowledged ones escalate at 30 minutes and 2 hours, CS-16/CS-40), then
 * this person's own notifications by day, with tabs by group, search and dates.
 */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const tab: Tab = (TABS as string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : "all";
  const f = { q: one(sp.q).trim().toLowerCase(), from: ISO.test(one(sp.from)) ? one(sp.from) : "", to: ISO.test(one(sp.to)) ? one(sp.to) : "" };

  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const db = await createSupabaseServerClient();
  const canAck = can(ctx.capabilities, "defects.triage");
  const [rows, alerts, members] = await Promise.all([
    listMyNotifications(db, orgId, LIMIT),
    canAck ? listCriticalAlerts(db, orgId, 50) : Promise.resolve([]),
    canAck ? listMembers(db, orgId).catch(() => []) : Promise.resolve([]),
  ]);
  const tz = ctx.timezone;
  const base = `/customer/${orgId}`;
  const now = nowMs();
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const today = dayOf(new Date(now).toISOString());
  const yesterday = dayOf(new Date(now - 86_400_000).toISOString());

  // Counts per tab (before search and dates, so the tabs stay steady while filtering).
  const count: Record<Tab, number> = { all: rows.length, unread: 0, safety: 0, maintenance: 0, marketplace: 0, account: 0 };
  for (const n of rows) {
    if (!n.read_at) count.unread++;
    count[notificationKind(n.kind).group]++;
  }
  const unreadIn: Record<NotificationGroup, number> = { safety: 0, maintenance: 0, marketplace: 0, account: 0 };
  for (const n of rows) if (!n.read_at) unreadIn[notificationKind(n.kind).group]++;

  const filtering = Boolean(f.q || f.from || f.to);
  const shown = rows.filter((n) => {
    const day = dayOf(n.created_at);
    return (
      (tab === "all" || (tab === "unread" ? !n.read_at : notificationKind(n.kind).group === tab)) &&
      (!f.q || [n.title, n.body, notificationKind(n.kind).label].some((x) => (x ?? "").toLowerCase().includes(f.q))) &&
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to)
    );
  });

  const timeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  const weekdayFmt = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "long" });
  const sections: NotificationSection[] = [];
  for (const n of shown) {
    const day = dayOf(n.created_at);
    const at = new Date(n.created_at);
    const heading = day === today ? "Today" : day === yesterday ? "Yesterday" : `${weekdayFmt.format(at)} ${formatDateAU(at, tz)}`;
    let section = sections[sections.length - 1];
    if (!section || section.heading !== heading) sections.push((section = { heading, items: [] }));
    section.items.push({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: notificationPath(n, base, `${base}/notifications`),
      time: timeFmt.format(at).replace(/\s?([AP]M)$/i, (_m, p: string) => ` ${p.toLowerCase()}`),
      ago: day === today ? timeAgo(n.created_at, now) : null,
      unread: !n.read_at,
    });
  }

  const open = alerts.filter((a) => !a.acknowledged_at);
  const recent = alerts.filter((a) => a.acknowledged_at).slice(0, 10);
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile?.full_name || "someone";
  const tabHref = (t: Tab) => {
    const q = new URLSearchParams();
    if (t !== "all") q.set("tab", t);
    if (f.q) q.set("q", f.q);
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
    const s = q.toString();
    return `${base}/notifications${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description={count.unread ? `${count.unread} unread. Open one to see what it's about.` : "You're all caught up."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/account/notifications">
                <Mail /> Email preferences
              </Link>
            </Button>
            {count.unread ? <MarkAllRead orgId={orgId} /> : null}
          </div>
        }
      />

      {canAck ? (
        open.length ? (
          <Card className="mb-5 overflow-hidden border-danger-line">
            <div className="flex items-center gap-3 border-b border-danger-line bg-danger-soft px-5 py-3">
              <OctagonAlert className="size-5 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-danger-ink">
                  {open.length} critical alert{open.length === 1 ? "" : "s"} waiting for acknowledgement
                </h2>
                <p className="text-[13px] text-danger-ink/80">Acknowledging tells everyone someone is dealing with it. It doesn&apos;t clear the equipment.</p>
              </div>
            </div>
            <ul className="divide-y divide-stroke">
              {open.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-ink">{a.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-subtle">
                      <span>
                        Raised {formatDateTimeAU(new Date(a.raised_at), tz)} ({timeAgo(a.raised_at, now)})
                      </span>
                      {a.escalation_level ? <Badge tone="red">{ESCALATION[a.escalation_level]}</Badge> : null}
                      <Link href={`${base}/equipment/${a.asset_id}`} className="font-semibold text-link hover:underline">
                        Open {a.asset?.asset_number ?? "equipment"}
                      </Link>
                    </p>
                  </div>
                  <AcknowledgeButton orgId={orgId} alertId={a.id} />
                </li>
              ))}
            </ul>
            {recent.length ? <RecentlyAcknowledged items={recent.map((a) => `${a.title}: acknowledged by ${nameOf(a.acknowledged_by)} ${formatDateTimeAU(new Date(a.acknowledged_at!), tz)}`)} /> : null}
          </Card>
        ) : (
          <Card className="mb-5 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ok-soft text-ok-ink" aria-hidden>
                <ShieldCheck className="size-4" />
              </span>
              <p className="text-[14px] text-ink">
                <span className="font-semibold">No critical alerts waiting.</span>{" "}
                <span className="text-ink-muted">Critical faults, out-of-service holds, breakdowns and Major defect notices appear here for acknowledgement.</span>
              </p>
            </div>
            {recent.length ? <RecentlyAcknowledged items={recent.map((a) => `${a.title}: acknowledged by ${nameOf(a.acknowledged_by)} ${formatDateTimeAU(new Date(a.acknowledged_at!), tz)}`)} /> : null}
          </Card>
        )
      ) : null}

      <Card className="overflow-hidden">
        <nav aria-label="Notification groups" className="flex gap-1 overflow-x-auto border-b border-stroke px-3 pt-2">
          {TABS.filter((t) => t === "all" || t === "unread" || t === tab || count[t] > 0).map((t) => {
            const unreadDot = t !== "all" && t !== "unread" && unreadIn[t] > 0;
            return (
              <Link
                key={t}
                href={tabHref(t)}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 pt-1.5 pb-2.5 text-[14px] font-medium whitespace-nowrap",
                  tab === t ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {TAB_LABEL[t]}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11.5px] font-semibold",
                    t === "unread" && count.unread ? "bg-brand text-white" : tab === t ? "bg-brand-soft text-brand-ink" : "bg-surface-muted text-ink-subtle",
                  )}
                >
                  {count[t]}
                </span>
                {unreadDot ? <span className="size-1.5 rounded-full bg-brand" aria-label={`${unreadIn[t as NotificationGroup]} unread`} /> : null}
              </Link>
            );
          })}
        </nav>
        <FilterBar
          action={`${base}/notifications`}
          keep={tab === "all" ? {} : { tab }}
          search={{ value: f.q, placeholder: "Search notifications" }}
          fields={[
            { kind: "date", name: "from", label: "From", value: f.from },
            { kind: "date", name: "to", label: "To", value: f.to },
          ]}
        />
        {sections.length ? (
          <NotificationList orgId={orgId} sections={sections} />
        ) : filtering ? (
          <EmptyState title="No notifications match">Try a different search or dates.</EmptyState>
        ) : tab === "unread" ? (
          <EmptyState icon={<ShieldCheck />} title="You're all caught up">
            Nothing unread.{" "}
            <Link href={tabHref("all")} className="font-semibold text-link hover:underline">
              See all notifications
            </Link>
          </EmptyState>
        ) : (
          <EmptyState icon={<BellOff />} title={tab === "all" ? "No notifications yet" : `No ${TAB_LABEL[tab].toLowerCase()} notifications`}>
            Defects, holds, breakdowns, missed pre-starts, approvals, marketplace activity and invoices show up here.
          </EmptyState>
        )}
        {rows.length >= LIMIT ? <p className="border-t border-stroke px-5 py-2.5 text-[12.5px] text-ink-subtle">Showing your latest {LIMIT} notifications.</p> : null}
      </Card>
    </>
  );
}

function RecentlyAcknowledged({ items }: { items: string[] }) {
  return (
    <details className="group border-t border-stroke">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        Recently acknowledged ({items.length})
      </summary>
      <ul className="flex flex-col gap-1.5 px-5 pb-3 pl-11 text-[13px] text-ink-muted">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </details>
  );
}
