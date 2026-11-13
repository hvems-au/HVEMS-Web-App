import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LogOut, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { getOperatorCompanies, safeDriverPath } from "@/features/operator/context";
import { getSessionUser } from "@/lib/session";
import { firstParam } from "@/lib/utils";
import { driverSignOutAction } from "./actions";
import { CodeForm } from "./code-form";
import { DriverSignIn } from "./e/[code]/sign-in";

export const metadata: Metadata = { title: "Operator sign in" };

/**
 * Driver / Operator sign in (bookmarkable). Signed in: straight to the operator
 * dashboard (or the page they were heading to; choose a company if they work for
 * several). Signed out: sign in with company code + Operator ID + PIN, first-time
 * setup, or an email login; or open a scanned equipment code.
 */
export default async function DriverPortalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeDriverPath(firstParam(sp.next));
  const choose = firstParam(sp.choose) === "1";
  const user = await getSessionUser();

  if (user) {
    const companies = await getOperatorCompanies();
    if (next && !choose) redirect(next);
    if (companies.length === 1 && !choose) redirect(`/driver/o/${companies[0]!.organisation_id}`);
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader
            title={companies.length ? "Choose a company" : "No operator access"}
            description={
              companies.length
                ? "You work for more than one company. Pick the one you're working for now."
                : "This account isn't set up to do pre-starts or report issues for any company. Ask your manager, or sign in with a different account."
            }
          />
          <CardBody className="flex flex-col gap-2">
            {companies.map((c) => (
              <Link
                key={c.organisation_id}
                href={`/driver/o/${c.organisation_id}`}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-stroke px-4 py-3 font-semibold text-ink hover:border-stroke-strong hover:bg-surface-hover"
              >
                {c.organisation_name}
                <ChevronRight className="size-5 text-ink-subtle" aria-hidden />
              </Link>
            ))}
            <form action={driverSignOutAction.bind(null, undefined)} className="mt-2">
              <Button type="submit" variant="ghost" size="sm">
                <LogOut /> Sign out ({user.fullName || user.email})
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-[26px] leading-tight font-bold text-ink">Operator sign in</h1>
      <p className="mt-1 mb-5 text-[15px] text-ink-muted">
        {next ? "Sign in to continue." : "For operators and contractors: do pre-starts, report issues and see your history."}
      </p>
      <Card>
        <CardBody>
          <DriverSignIn next={next} initialMode={firstParam(sp.mode) === "email" ? "email" : "pin"} />
        </CardBody>
      </Card>
      <details className="card group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[14.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <QrCode className="size-5 text-brand-ink" aria-hidden />
          Have a QR code on the equipment?
        </summary>
        <div className="border-t border-stroke px-5 py-4">
          <p className="mb-3 text-[14px] text-ink-muted">Scan it with your phone camera, or type the code printed under it.</p>
          <CodeForm />
        </div>
      </details>
      <p className="mt-5 text-center text-[13.5px] text-ink-muted">
        Office or workshop staff?{" "}
        <Link href="/login" className="font-semibold text-link hover:underline">
          Sign in with email
        </Link>
      </p>
    </div>
  );
}
