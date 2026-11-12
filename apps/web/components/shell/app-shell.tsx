"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { ArrowUpRight, Bell, Check, ChevronsUpDown, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ICONS } from "@/components/shell/icons";
import { IdleTimer } from "@/components/shell/idle-timer";
import type { NavSection } from "@/lib/navigation";
import { cn, initials } from "@/lib/utils";

export interface ShellContext {
  id: string;
  name: string;
  kindLabel: string;
  portal: "customer" | "provider" | "admin";
  roleLabel: string;
  href: string;
  /** Short-lived link to the organisation's logo, when it has one. */
  logoUrl?: string | null;
}

export interface AppShellProps {
  nav: NavSection[];
  user: { fullName: string; email: string };
  current: ShellContext;
  contexts: ShellContext[];
  banner?: React.ReactNode;
  /** Where the bell goes and how many alerts are unread (company portal). */
  alerts?: { href: string; unread: number };
  children: React.ReactNode;
}

function NavLinks({ nav, onNavigate }: { nav: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {nav.map((section, i) => (
        <div key={i} className={cn(i > 0 && "border-t border-white/10 pt-4")}>
          {section.title ? (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand">{section.title}</p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={item.increment ? `${item.label} — delivered in increment ${item.increment}` : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-[7px] px-3 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-brand text-white shadow-sm"
                        : item.increment
                          ? "text-white/45 hover:bg-white/8 hover:text-white/80"
                          : "text-white/90 hover:bg-white/8 hover:text-white",
                    )}
                  >
                    <Icon className="size-[17px] shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.increment ? <span className="sr-only">(coming in increment {item.increment})</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ContextSwitcher({ current, contexts }: { current: ShellContext; contexts: ShellContext[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-white/25 px-2.5 py-2.5 text-left text-white hover:border-white/50"
        aria-label="Switch organisation or portal"
      >
        {current.logoUrl ? (
          <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-[6px] bg-white p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link from private storage */}
            <img src={current.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
          </span>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-shade">
            {initials(current.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold">{current.name}</span>
          <span className="block truncate text-[11px] text-white/60">{current.roleLabel}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-white/60" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-[10px] border border-stroke bg-white p-1.5 shadow-xl"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            Switch organisation or portal
          </DropdownMenu.Label>
          {contexts.map((c) => (
            <DropdownMenu.Item key={c.portal + c.id} asChild>
              {/* Handoff links issue a single-use sign-in token, so they must never be prefetched. */}
              <Link
                href={c.href}
                prefetch={c.href.startsWith("/auth/handoff") ? false : undefined}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-bold text-ink-muted">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-subtle">
                    {c.kindLabel} · {c.roleLabel}
                  </span>
                </span>
                {c.id === current.id && c.portal === current.portal ? (
                  <Check className="size-4 text-brand" aria-label="Current" />
                ) : c.href.startsWith("/auth/handoff") ? (
                  <ArrowUpRight className="size-4 text-ink-subtle" aria-label="Opens another portal" />
                ) : null}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-stroke" />
          <DropdownMenu.Item asChild>
            <Link href="/onboarding" className="block rounded-md px-2 py-2 text-[13px] text-link outline-none data-[highlighted]:bg-surface-muted">
              Create another account in this portal
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function UserMenu({ user }: { user: AppShellProps["user"] }) {
  // The sign-out form lives outside the menu: the menu closes (and leaves the page)
  // as soon as an item is chosen, which would cancel a form inside it.
  const signOutForm = React.useRef<HTMLFormElement>(null);
  return (
    <>
    <form ref={signOutForm} action="/auth/sign-out" method="post" className="hidden" />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex size-10 items-center justify-center rounded-full bg-shade text-[13px] font-semibold text-white ring-offset-2 hover:ring-2 hover:ring-brand/40"
        aria-label="Account menu"
      >
        {initials(user.fullName || user.email)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-64 rounded-[10px] border border-stroke bg-white p-1.5 shadow-xl">
          <div className="px-2 py-2">
            <p className="truncate text-[13.5px] font-semibold text-ink">{user.fullName || "Your account"}</p>
            <p className="truncate text-[12.5px] text-ink-subtle">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-stroke" />
          <DropdownMenu.Item asChild>
            <Link href="/account/security" className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-muted">
              <ShieldCheck className="size-4 text-ink-muted" /> Account security
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => signOutForm.current?.requestSubmit()}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ink outline-none data-[highlighted]:bg-surface-muted"
          >
            <LogOut className="size-4 text-ink-muted" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </>
  );
}

function SidebarBody({ nav, current, contexts, onNavigate }: Pick<AppShellProps, "nav" | "current" | "contexts"> & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 px-2.5 pt-5 pb-4">
      <Link href={current.href} className="mx-auto block w-[118px]" aria-label="HVEMS home">
        <Logo onDark priority />
      </Link>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <NavLinks nav={nav} onNavigate={onNavigate} />
      </div>
      <ContextSwitcher current={current} contexts={contexts} />
      <p className="px-1 text-center text-[10.5px] font-medium text-white/55">© {new Date().getFullYear()} HVEMS. All rights reserved.</p>
    </div>
  );
}

export function AppShell({ nav, user, current, contexts, banner, alerts, children }: AppShellProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-h-dvh bg-canvas">
      <IdleTimer />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] bg-shade lg:block">
        <SidebarBody nav={nav} current={current} contexts={contexts} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] bg-shade shadow-2xl">
            <button className="absolute top-3 right-3 rounded p-1 text-white/70 hover:text-white" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </button>
            <SidebarBody nav={nav} current={current} contexts={contexts} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-stroke/60 bg-canvas/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button className="rounded-md p-2 text-ink hover:bg-surface-muted" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
            <div className="w-24">
              <Logo variant="horizontal" />
            </div>
          </div>
          <p className="hidden truncate text-[13px] font-medium text-ink-muted lg:block">
            {current.name} <span className="text-ink-subtle">· {current.kindLabel}</span>
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={alerts?.href ?? current.href.replace(/\/dashboard$/, "") + "/module/notifications"}
              className="relative rounded-full p-2 text-ink hover:bg-surface-muted"
              aria-label={alerts?.unread ? `Alerts: ${alerts.unread} unread` : "Alerts"}
            >
              <Bell className="size-[22px]" />
              {alerts?.unread ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                  {alerts.unread > 99 ? "99+" : alerts.unread}
                </span>
              ) : null}
            </Link>
            <UserMenu user={user} />
          </div>
        </header>
        {banner}
        <main id="main" className="px-4 py-5 sm:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
