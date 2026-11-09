import type { Metadata } from "next";
import Link from "next/link";
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
  const info = PORTAL_INFO[await getCurrentPortal()];
  return (
    <AuthCard title={info.loginTitle} subtitle={info.loginSubtitle}>
      {error ? (
        <div className="mb-5">
          <FormAlert>That link is invalid or has expired. Please sign in or request a new link.</FormAlert>
        </div>
      ) : null}
      {/* Self sign-up only where the portal offers it (never the Super Admin console, SoW §2.3). */}
      <SignInForm next={next} allowSignUp={info.signUp} />
      {publicEnv.NEXT_PUBLIC_SUPPORT_URL ? (
        <p className="mt-6 text-center text-[12px] font-semibold text-ink-subtle">
          Need help?{" "}
          <Link href={publicEnv.NEXT_PUBLIC_SUPPORT_URL} className="text-link">
            Contact Support
          </Link>
        </p>
      ) : null}
    </AuthCard>
  );
}
