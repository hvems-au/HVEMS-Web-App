import "server-only";
import { ROLE_LABELS, can, type MemberRole } from "@hvems/permissions";

/** What the top bar and account switcher call the portal, by the person's role. */
const PORTAL_LABELS: Record<MemberRole, string> = {
  owner: "Company Portal",
  administrator: "Company Portal",
  fleet_manager: "Fleet Manager Portal",
  technician: "Technician Portal",
  driver_operator: "Operator Portal",
  finance: "Finance Portal",
  viewer: "Viewer Portal",
  account_owner: "Marketplace Portal",
  job_manager: "Marketplace Portal",
  provider_owner: "Provider Portal",
  provider_manager: "Provider Portal",
  provider_technician: "Provider Technician Portal",
};

/**
 * The current company: the most senior label any of the person's roles gives
 * (additional roles count), e.g. a Fleet Manager who is also a Company Admin
 * sees Company Portal.
 */
export function currentShellContext(ctx: OrgContext, current: PortalId): ShellContext {
  const base = toShellContext(ctx.context, current);
  if (ctx.context.kind === "company" && (can(ctx.capabilities, "org.members.manage") || can(ctx.capabilities, "org.settings.manage"))) {
    return { ...base, kindLabel: "Company Portal" };
  }
  return base;
}

/** Technicians who don't manage anything start on My Jobs, so the fleet Dashboard isn't for them. */
export function isTechnicianOnly(ctx: OrgContext): boolean {
  return can(ctx.capabilities, "work_orders.work") && !can(ctx.capabilities, "work_orders.manage") && !can(ctx.capabilities, "assets.manage");
}
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
    kindLabel: PORTAL_LABELS[c.role] ?? "Company Portal",
    portal: c.kind === "provider" ? "provider" : "customer",
    roleLabel: ROLE_LABELS[c.role],
    href: contextHref(c, current),
  };
}

/** Hide navigation the member can't use (presentation only — the database enforces access). */
export function filterNav(nav: NavSection[], ctx: OrgContext): NavSection[] {
  return nav
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => (!i.capability || can(ctx.capabilities, i.capability)) && !(i.hideForTechnicians && isTechnicianOnly(ctx))),
    }))
    .filter((s) => s.items.length > 0);
}
