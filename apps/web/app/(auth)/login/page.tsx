import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HardHat } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { FormAlert } from "@/components/ui/form";
import { getCurrentPortal } from "@/lib/current-portal";
import { publicEnv } from "@/lib/env";
import { PORTAL_INFO } from "@/lib/portals";
import { firstParam } from "@/lib/utils";
import { SignInForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: PORTAL_INFO[await getCurrentPortal()].loginTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = firstParam(sp.next);
  const error = firstParam(sp.error);
  const idle = firstParam(sp.reason) === "idle";
  const portal = await getCurrentPortal();
  const info = PORTAL_INFO[portal];
  return (
    <AuthCard eyebrow={info.name} title="Sign in" subtitle={info.loginSubtitle}>
      {error ? (
        <div className="mb-5">
          <FormAlert>That link is invalid or has expired. Please sign in or request a new link.</FormAlert>
        </div>
      ) : null}
      {idle && !error ? (
        <div className="mb-5">
          <FormAlert tone="info">You were signed out because there was no activity for a while. Sign in again to continue.</FormAlert>
        </div>
      ) : null}
      {/* Self sign-up only where the portal offers it (never the Super Admin console, SoW §2.3). */}
      <SignInForm next={next} allowSignUp={info.signUp} />
      {portal === "company" ? (
        <>
          <div className="my-5 flex items-center gap-3 text-[12.5px] font-medium text-ink-subtle" aria-hidden>
            <span className="h-px flex-1 bg-stroke" />
            or
            <span className="h-px flex-1 bg-stroke" />
          </div>
          <Link
            href="/driver?mode=pin"
            className="group flex items-center gap-3 rounded-[12px] border border-stroke bg-surface px-4 py-3 transition-colors hover:border-brand hover:bg-brand-soft"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink group-hover:bg-brand group-hover:text-white" aria-hidden>
              <HardHat className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold text-ink">Operator or contractor?</span>
              <span className="block text-[12.5px] text-ink-muted">Sign in with your Operator ID and PIN, or scan the QR label on the equipment</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </>
      ) : null}
      {publicEnv.NEXT_PUBLIC_SUPPORT_URL ? (
        <p className="mt-6 text-center text-[13px] text-ink-muted">
          Need help?{" "}
          <Link href={publicEnv.NEXT_PUBLIC_SUPPORT_URL} className="font-medium text-link hover:underline">
            Contact support
          </Link>
        </p>
      ) : null}
    </AuthCard>
  );
}
