"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover as P } from "radix-ui";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import type { AppNotification } from "@hvems/types";
import { loadTrayAction, markTrayReadAction } from "@/features/alerts/tray-actions";
import { notificationPath } from "@/lib/notification-links";
import { TONE_CLASS, notificationKind, timeAgo } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

/**
 * Bell with a tray of the latest notifications. Opening it loads them fresh; clicking
 * one marks it read and opens what it's about; "Mark all read" and "See all
 * notifications" (the full Notifications page) sit at the top and bottom.
 */
export function NotificationTray({ orgId, href, unread, base }: { orgId: string; href: string; unread: number; base?: string }) {
  const portalBase = base ?? `/customer/${orgId}`;
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

  const targetOf = (n: AppNotification) => notificationPath(n, portalBase, href);

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
          aria-label={count ? `Notifications: ${count} unread` : "Notifications"}
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
              Notifications{count ? <span className="ml-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[12px] font-bold text-danger-ink">{count} new</span> : null}
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
                <p className="text-[13px] text-ink-muted">Safety alerts, reminders, marketplace and account updates show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stroke">
                {items.map((n) => {
                  const k = notificationKind(n.kind);
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
                          <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", TONE_CLASS[k.tone])} aria-hidden>
                            <k.icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-[13.5px] leading-snug text-ink", !n.read_at && "font-semibold")}>{n.title}</span>
                            {n.body ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-muted">{n.body}</span> : null}
                            <span className="mt-0.5 block text-[12px] text-ink-subtle">{k.label} · {timeAgo(n.created_at)}</span>
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
              See all notifications
            </Link>
          </P.Close>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
