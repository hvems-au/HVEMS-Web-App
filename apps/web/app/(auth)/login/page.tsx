import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { FormAlert } from "@/components/ui/form";
import { isAdminHost } from "@/lib/admin-host";
import { publicEnv } from "@/lib/env";
import { firstParam } from "@/lib/utils";
import { SignInForm } from "../forms";

async function onAdminHost(): Promise<boolean> {
  return isAdminHost((await headers()).get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await onAdminHost()) ? "Administrator Login" : "Login" };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = firstParam(sp.next);
  const error = firstParam(sp.error);
  // The administration console is for HVEMS staff only: no self sign-up (SoW §2.3).
  const admin = await onAdminHost();
  return (
    <AuthCard
      title={admin ? "Administrator Login" : "Login"}
      subtitle={
        admin
          ? "HVEMS staff access to the platform administration console."
          : "Access your HVEMS account to manage equipment, maintenance, inspections, jobs and your team."
      }
    >
      {error ? (
        <div className="mb-5">
          <FormAlert>That link is invalid or has expired. Please sign in or request a new link.</FormAlert>
        </div>
      ) : null}
      <SignInForm next={next} allowSignUp={!admin} />
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
