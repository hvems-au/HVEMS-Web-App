import { AppShell } from "@/components/shell/app-shell";
import { providerNav } from "@/lib/navigation";
import { getCurrentPortal } from "@/lib/current-portal";
import { signOrganisationLogo } from "@hvems/api-client";
import { loadOrgContext } from "@/lib/session";
import { filterNav, toShellContext } from "@/lib/shell-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProviderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [ctx, portal] = await Promise.all([loadOrgContext(orgId), getCurrentPortal()]);
  const logoUrl = ctx.logoPath ? await signOrganisationLogo(await createSupabaseServerClient(), ctx.logoPath, 3600).catch(() => null) : null;
  return (
    <AppShell
      nav={filterNav(providerNav(orgId), ctx)}
      user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
      current={{ ...toShellContext(ctx.context, portal), logoUrl }}
      contexts={ctx.contexts.map((c) => toShellContext(c, portal))}
      banner={
        ctx.context.status === "suspended" ? (
          <div role="alert" className="border-b border-danger/30 bg-danger-soft px-6 py-2.5 text-[13.5px] text-[#9b0b0c]">
            This provider account has been de-activated by HVEMS: proposals and new engagements are paused. Contact HVEMS support for details.
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
