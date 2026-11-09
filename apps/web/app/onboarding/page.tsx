import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getContexts, requireUser } from "@/lib/session";
import { firstParam } from "@/lib/utils";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/onboarding");
  const contexts = await getContexts();
  const kind = firstParam((await searchParams).kind);
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-4xl">
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
          <h1 className="text-[26px] font-bold text-ink-muted">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
          <p className="mt-1 mb-7 text-[15px] text-ink-subtle">
            One login can hold several company memberships and a separate provider account. Each keeps its own records.
          </p>
          <OnboardingForm defaultKind={kind} />
        </div>
      </div>
    </div>
  );
}
