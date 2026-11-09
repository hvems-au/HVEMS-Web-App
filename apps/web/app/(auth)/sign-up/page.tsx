import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { getCurrentPortal } from "@/lib/current-portal";
import type { PortalId } from "@/lib/portals";
import { firstParam } from "@/lib/utils";
import { SignUpForm } from "../forms";

const COPY: Partial<Record<PortalId, { title: string; subtitle: string }>> = {
  company: {
    title: "Create your company account",
    subtitle: "Manage your fleet and post marketplace jobs. After you verify your email you'll set up your company. First five assets free.",
  },
  market: {
    title: "Create your marketplace account",
    subtitle: "Post breakdown, repair and service jobs without a fleet subscription. Verify your email, then set up your account.",
  },
  provider: {
    title: "Create your provider account",
    subtitle: "Get verified, find jobs and submit proposals. Verify your email, then add your business details and ABN.",
  },
};

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = firstParam((await searchParams).next);
  const copy = COPY[await getCurrentPortal()] ?? COPY.company!;
  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      <SignUpForm next={next} />
    </AuthCard>
  );
}
