import { countUnreadNotifications } from "@hvems/api-client";
import { AppShell } from "@/components/shell/app-shell";
import { customerNav } from "@/lib/navigation";
import { getCurrentPortal } from "@/lib/current-portal";
import { signOrganisationLogo } from "@hvems/api-client";
import { loadOrgContext } from "@/lib/session";
import { currentShellContext, filterNav, toShellContext } from "@/lib/shell-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CustomerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [ctx, portal] = await Promise.all([loadOrgContext(orgId), getCurrentPortal()]);
  const restricted = ctx.context.status === "restricted";
  const isCompany = ctx.context.kind === "company";
  // Fetched together: each trip to the database adds noticeable time.
  const db = await createSupabaseServerClient();
  const [logoUrl, unread, membership] = await Promise.all([
    ctx.logoPath ? signOrganisationLogo(db, ctx.logoPath, 3600).catch(() => null) : Promise.resolve(null),
    isCompany ? countUnreadNotifications(db, orgId).catch(() => 0) : Promise.resolve(0),
    // Additional roles decide some menu items (e.g. My Jobs for anyone who is also a Technician).
    db.from("org_memberships").select("role, additional_roles").eq("organisation_id", orgId).eq("user_id", ctx.user.id).maybeSingle(),
  ]);
  const roles = [ctx.context.role as string, ...(((membership.data as { additional_roles?: string[] } | null)?.additional_roles) ?? [])];
  return (
    <AppShell
      nav={filterNav(customerNav(orgId, ctx.context.kind), ctx, roles)}
      user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
      current={{ ...currentShellContext(ctx, portal), logoUrl }}
      contexts={ctx.contexts.map((c) => toShellContext(c, portal))}
      alerts={isCompany ? { href: `/customer/${orgId}/alerts`, unread, orgId } : undefined}
      banner={
        ctx.context.status === "suspended" ? (
          <div role="alert" className="border-b border-danger/30 bg-danger-soft px-6 py-2.5 text-[13.5px] text-danger-ink">
            This account has been de-activated by HVEMS: equipment and members can&apos;t be added and jobs can&apos;t be posted. Safety functions keep
            working. Contact HVEMS support for details.
          </div>
        ) : restricted ? (
          <div role="alert" className="border-b border-danger/30 bg-danger-soft px-6 py-2.5 text-[13.5px] text-danger-ink">
            This account is restricted for non-payment: assets and members can&apos;t be added and jobs can&apos;t be posted. Safety functions keep
            working.
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
