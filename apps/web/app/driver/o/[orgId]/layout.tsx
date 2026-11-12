import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOperatorCompanies, loadOperatorContext } from "@/features/operator/context";
import { OperatorTabs } from "@/features/operator/nav";
import Link from "next/link";
import { driverSignOutAction } from "../../actions";

/** Operator workspace for one company: who and where, then the four sections. */
export default async function OperatorWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOperatorContext(orgId, `/driver/o/${orgId}`);
  const companies = await getOperatorCompanies();
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{ctx.company.organisation_name}</p>
          <p className="truncate text-[13px] text-ink-muted">
            Signed in as {ctx.user.fullName || ctx.user.email}
            {companies.length > 1 ? (
              <>
                {" · "}
                <Link href="/driver?choose=1" className="font-medium text-link hover:underline">
                  Switch company
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <form action={driverSignOutAction.bind(null, undefined)}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
      <OperatorTabs orgId={orgId} />
      {children}
    </>
  );
}
