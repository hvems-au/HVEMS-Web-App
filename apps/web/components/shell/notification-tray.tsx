"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover as P } from "radix-ui";
import { Bell, BellRing, CheckCheck, ClipboardX, FileWarning, Hand, IdCard, LifeBuoy, Loader2, OctagonAlert, TriangleAlert, UserX, Wrench, type LucideIcon } from "lucide-react";
import type { AppNotification } from "@hvems/types";
import { loadTrayAction, markTrayReadAction } from "@/features/alerts/tray-actions";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: LucideIcon; tone: string }> = {
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
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * Bell with a tray of the latest alerts. Opening it loads them fresh; clicking
 * one marks it read and opens what it's about; "Mark all read" and "See all
 * alerts" (the full Alerts page) sit at the top and bottom.
 */
export function NotificationTray({ orgId, href, unread }: { orgId: string; href: string; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<AppNotification[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(unread);
  const [busy, start] = React.useTransition();
  // A fresh unread count from the server (after navigation) replaces the local one.
  const [serverUnread, setServerUnread] = React.useState(unread);
  if (serverUnread !== unread) {
    setServerUnread(unread);
    setCount(unread);
  }

  const load = React.useCallback(() => {
    start(async () => {
      const res = await loadTrayAction(orgId);
      setItems(res.items);
      setError(res.error ?? null);
    });
  }, [orgId]);

  const targetOf = (n: AppNotification) =>
    n.inspection_id ? `/customer/${orgId}/inspections/${n.inspection_id}` : n.asset_id ? `/customer/${orgId}/equipment/${n.asset_id}` : href;

  const markAll = () => {
    setItems((xs) => (xs ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setCount(0);
    void markTrayReadAction(orgId).then(() => router.refresh());
  };

  return (
    <P.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <P.Trigger asChild>
        <button
          type="button"
          className={cn("relative rounded-full p-2 text-ink hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", open && "bg-surface-muted")}
          aria-label={count ? `Alerts: ${count} unread` : "Alerts"}
        >
          <Bell className="size-[22px]" />
          {count ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 flex max-h-[min(560px,80vh)] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[14px] border border-stroke bg-surface-raised shadow-[var(--elev-pop)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between gap-3 border-b border-stroke px-4 py-3">
            <p className="text-[15px] font-semibold text-ink">
              Alerts{count ? <span className="ml-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[12px] font-bold text-danger-ink">{count} new</span> : null}
            </p>
            {count ? (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-[13px] font-medium text-link hover:underline">
                <CheckCheck className="size-4" aria-hidden /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items === null || (busy && !items.length) ? (
              <p className="flex items-center justify-center gap-2 px-4 py-10 text-[14px] text-ink-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
              </p>
            ) : error ? (
              <p className="px-4 py-10 text-center text-[14px] text-danger-ink">{error}</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto size-8 text-ink-subtle" aria-hidden />
                <p className="mt-2 text-[14px] font-medium text-ink">You&apos;re all caught up</p>
                <p className="text-[13px] text-ink-muted">Faults, holds, breakdowns and notices show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stroke">
                {items.map((n) => {
                  const k = KIND[n.kind] ?? { icon: Bell, tone: "text-ink-muted" };
                  return (
                    <li key={n.id}>
                      <P.Close asChild>
                        <Link
                          href={targetOf(n)}
                          onClick={() => {
                            if (!n.read_at) {
                              setCount((c) => Math.max(0, c - 1));
                              void markTrayReadAction(orgId, [n.id]);
                            }
                          }}
                          className={cn("flex gap-3 px-4 py-3 hover:bg-surface-hover", !n.read_at && "bg-brand-soft/60")}
                        >
                          <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted", k.tone)} aria-hidden>
                            <k.icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-[13.5px] leading-snug text-ink", !n.read_at && "font-semibold")}>{n.title}</span>
                            {n.body ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-muted">{n.body}</span> : null}
                            <span className="mt-0.5 block text-[12px] text-ink-subtle">{ago(n.created_at)}</span>
                          </span>
                          {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                        </Link>
                      </P.Close>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <P.Close asChild>
            <Link href={href} className="block border-t border-stroke px-4 py-2.5 text-center text-[13.5px] font-semibold text-link hover:bg-surface-hover">
              See all alerts
            </Link>
          </P.Close>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
