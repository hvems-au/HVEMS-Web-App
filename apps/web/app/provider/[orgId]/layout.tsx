import { AppShell } from "@/components/shell/app-shell";
import { providerNav } from "@/lib/navigation";
import { getCurrentPortal } from "@/lib/current-portal";
import { countUnreadNotifications, signOrganisationLogo } from "@hvems/api-client";
import { loadOrgContext } from "@/lib/session";
import { currentShellContext, filterNav, toShellContext } from "@/lib/shell-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProviderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [ctx, portal] = await Promise.all([loadOrgContext(orgId), getCurrentPortal()]);
  const db = await createSupabaseServerClient();
  const [logoUrl, unread] = await Promise.all([
    ctx.logoPath ? signOrganisationLogo(db, ctx.logoPath, 3600).catch(() => null) : Promise.resolve(null),
    countUnreadNotifications(db, orgId).catch(() => 0),
  ]);
  return (
    <AppShell
      nav={filterNav(providerNav(orgId), ctx)}
      user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
      current={{ ...currentShellContext(ctx, portal), logoUrl }}
      contexts={ctx.contexts.map((c) => toShellContext(c, portal))}
      alerts={{ href: `/provider/${orgId}/jobs`, unread, orgId, base: `/provider/${orgId}` }}
      banner={
        ctx.context.status === "suspended" ? (
          <div role="alert" className="border-b border-danger/30 bg-danger-soft px-6 py-2.5 text-[13.5px] text-danger-ink">
            This provider account has been de-activated by HVEMS: proposals and new engagements are paused. Contact HVEMS support for details.
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
