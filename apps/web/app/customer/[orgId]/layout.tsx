import { AppShell } from "@/components/shell/app-shell";
import { customerNav } from "@/lib/navigation";
import { loadOrgContext } from "@/lib/session";
import { filterNav, toShellContext } from "@/lib/shell-data";

export default async function CustomerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  const restricted = ctx.context.status === "restricted";
  return (
    <AppShell
      nav={filterNav(customerNav(orgId, ctx.context.kind), ctx)}
      user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
      current={toShellContext(ctx.context)}
      contexts={ctx.contexts.map(toShellContext)}
      banner={
        restricted ? (
          <div role="alert" className="border-b border-danger/30 bg-danger-soft px-6 py-2.5 text-[13.5px] text-[#9b0b0c]">
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
