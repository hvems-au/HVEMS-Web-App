import "server-only";
import { KIND_LABELS, ROLE_LABELS, can } from "@hvems/permissions";
import type { MyContext } from "@hvems/types";
import type { ShellContext } from "@/components/shell/app-shell";
import type { NavSection } from "@/lib/navigation";
import { contextHref } from "@/lib/current-portal";
import type { PortalId } from "@/lib/portals";
import type { OrgContext } from "@/lib/session";

/** `current` decides whether the link stays in this portal or hands off to another. */
export function toShellContext(c: MyContext, current: PortalId): ShellContext {
  return {
    id: c.organisation_id,
    name: c.organisation_name,
    kindLabel: KIND_LABELS[c.kind],
    portal: c.kind === "provider" ? "provider" : "customer",
    roleLabel: ROLE_LABELS[c.role],
    href: contextHref(c, current),
  };
}

/** Hide navigation the member can't use (presentation only — the database enforces access). */
export function filterNav(nav: NavSection[], ctx: OrgContext): NavSection[] {
  return nav
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.capability || can(ctx.capabilities, i.capability)) }))
    .filter((s) => s.items.length > 0);
}
