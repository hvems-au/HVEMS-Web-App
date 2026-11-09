import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getCurrentPortal } from "@/lib/current-portal";
import { PORTAL_INFO, portalOrigin, type PortalId } from "@/lib/portals";
import { getContexts, requireUser } from "@/lib/session";
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
  const [contexts, portal] = await Promise.all([getContexts(), getCurrentPortal()]);
  const info = PORTAL_INFO[portal];
  if (info.orgKinds.length === 0) notFound();
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
