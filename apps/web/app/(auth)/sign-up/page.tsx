import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { firstParam } from "@/lib/utils";
import { SignUpForm } from "../forms";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = firstParam((await searchParams).next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="One login for everything. After you verify your email you'll choose a company, marketplace-only or provider account."
    >
      <SignUpForm next={next} />
    </AuthCard>
  );
}
