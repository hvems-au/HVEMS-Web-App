"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { markTrayReadAction } from "@/features/alerts/tray-actions";
import { GROUP_LABEL, TONE_CLASS, notificationKind } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  /** Pre-formatted on the server (no hydration mismatch): "8:05 am" and "5 min ago". */
  time: string;
  ago: string | null;
  unread: boolean;
}

export interface NotificationSection {
  heading: string;
  items: NotificationItem[];
}

/** Notifications grouped by day. Clicking one marks it read and opens what it is about. */
export function NotificationList({ orgId, sections }: { orgId: string; sections: NotificationSection[] }) {
  const [read, setRead] = React.useState<Set<string>>(() => new Set());
  return (
    <div>
      {sections.map((s) => (
        <section key={s.heading} aria-label={s.heading}>
          <h3 className="border-y border-stroke bg-surface-muted px-5 py-1.5 text-[12px] font-semibold tracking-wide text-ink-subtle uppercase">{s.heading}</h3>
          <ul className="divide-y divide-stroke">
            {s.items.map((n) => {
              const k = notificationKind(n.kind);
              const unread = n.unread && !read.has(n.id);
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      if (!unread) return;
                      setRead((r) => new Set(r).add(n.id));
                      void markTrayReadAction(orgId, [n.id]);
                    }}
                    className={cn(
                      "group relative flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                      unread && "bg-brand-soft/40",
                    )}
                  >
                    {unread ? <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden /> : null}
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", TONE_CLASS[k.tone])} aria-hidden>
                      <k.icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={cn("text-[14.5px] leading-snug text-ink", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
                        {unread ? <span className="sr-only">(unread)</span> : null}
                      </span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-relaxed text-ink-muted">{n.body}</span> : null}
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-subtle">
                        <span className="font-medium text-ink-muted">{k.label}</span>
                        <span aria-hidden>·</span>
                        <span>{GROUP_LABEL[k.group]}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {n.time}
                          {n.ago ? ` (${n.ago})` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 self-center">
                      {unread ? <span className="size-2.5 rounded-full bg-brand" aria-hidden /> : null}
                      <ChevronRight className="size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
