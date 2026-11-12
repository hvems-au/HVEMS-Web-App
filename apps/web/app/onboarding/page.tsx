import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getCurrentPortal } from "@/lib/current-portal";
import { PORTAL_INFO, portalOrigin, type PortalId } from "@/lib/portals";
import { Button } from "@/components/ui/button";
import { getContexts, getStaffContext, requireUser } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

const INTRO: Partial<Record<PortalId, string>> = {
  company: "Set up your company to manage your fleet. Your company can also post jobs to the marketplace from here.",
  market: "Set up your marketplace account to post jobs and engage verified providers.",
  provider: "Set up your provider business. HVEMS verifies providers before they can submit proposals.",
};

const ELSEWHERE: { portal: PortalId; label: string }[] = [
  { portal: "company", label: "Manage a fleet? Use the company portal" },
  { portal: "market", label: "Only need a job done? Use the marketplace" },
  { portal: "provider", label: "Offer services? Use the provider portal" },
];

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [contexts, portal, staff] = await Promise.all([getContexts(), getCurrentPortal(), getStaffContext().catch(() => null)]);
  const info = PORTAL_INFO[portal];
  if (info.orgKinds.length === 0) notFound();
  // HVEMS staff accounts can't belong to a customer organisation: point them to the console instead of a form that would be refused.
  if (staff) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
        <div className="card w-full max-w-md px-6 py-8 text-center sm:px-10">
          <div className="mx-auto mb-6 w-40">
            <Logo variant="horizontal" priority />
          </div>
          <h1 className="text-[22px] font-bold text-ink">This is an HVEMS staff account</h1>
          <p className="mt-2 text-[14.5px] text-ink-muted">
            Staff accounts use the Super Admin console. To work in a customer account, sign out and sign in with a separate customer login.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild size="lg">
              <a href={`${portalOrigin("admin")}/login`}>Go to the Super Admin console</a>
            </Button>
            <form action="/auth/sign-out" method="post">
              <Button type="submit" variant="ghost" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="w-40">
            <Logo variant="horizontal" priority />
          </div>
          {contexts.length > 0 ? (
            <Link href="/select-context" className="text-[14px] font-medium text-link hover:underline">
              Back to my accounts
            </Link>
          ) : null}
        </div>
        <div className="card px-6 py-8 sm:px-10">
          <h1 className="text-h1 text-ink">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
          <p className="mt-1 mb-7 text-[15px] text-ink-subtle">{INTRO[portal]}</p>
          <OnboardingForm kinds={info.orgKinds} />
        </div>
        <ul className="mt-6 flex flex-col gap-1.5 text-center text-[13.5px]">
          {ELSEWHERE.filter((e) => e.portal !== portal).map((e) => (
            <li key={e.portal}>
              <a href={`${portalOrigin(e.portal)}/sign-up`} className="text-link hover:underline">
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
