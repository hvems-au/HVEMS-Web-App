import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = firstParam((await searchParams).email);
  return (
    <AuthCard title="Check your email">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#fdeee3] text-brand">
          <MailCheck className="size-8" aria-hidden />
        </span>
        <p className="text-[15px] text-ink-muted">
          We&apos;ve sent a verification link to {email ? <strong className="text-ink">{email}</strong> : "your email address"}. Open it on this
          device to finish creating your account.
        </p>
        <p className="text-[13px] text-ink-subtle">Didn&apos;t get it? Check your junk folder, or wait a minute and sign up again.</p>
        <Link href="/login" className="text-[14px] font-semibold text-link hover:underline">
          Back to login
        </Link>
      </div>
    </AuthCard>
  );
}
