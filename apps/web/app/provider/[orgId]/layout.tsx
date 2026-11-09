import { AppShell } from "@/components/shell/app-shell";
import { providerNav } from "@/lib/navigation";
import { getCurrentPortal } from "@/lib/current-portal";
import { loadOrgContext } from "@/lib/session";
import { filterNav, toShellContext } from "@/lib/shell-data";

export default async function ProviderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [ctx, portal] = await Promise.all([loadOrgContext(orgId), getCurrentPortal()]);
  return (
    <AppShell
      nav={filterNav(providerNav(orgId), ctx)}
      user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
      current={toShellContext(ctx.context, portal)}
      contexts={ctx.contexts.map((c) => toShellContext(c, portal))}
    >
      {children}
    </AppShell>
  );
}
