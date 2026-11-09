import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { FormAlert } from "@/components/ui/form";
import { publicEnv } from "@/lib/env";
import { firstParam } from "@/lib/utils";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = firstParam(sp.next);
  const error = firstParam(sp.error);
  return (
    <AuthCard title="Login" subtitle="Access your HVEMS account to manage equipment, maintenance, inspections, jobs and your team.">
      {error ? (
        <div className="mb-5">
          <FormAlert>That link is invalid or has expired. Please sign in or request a new link.</FormAlert>
        </div>
      ) : null}
      <SignInForm next={next} />
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
