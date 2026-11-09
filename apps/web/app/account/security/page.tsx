import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/lib/session";
import { firstParam } from "@/lib/utils";
import { MfaPanel } from "./mfa-panel";

export const metadata: Metadata = { title: "Account security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/account/security");
  const sp = await searchParams;
  const next = firstParam(sp.next);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/select-context";
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mx-auto mb-8 w-44">
          <Logo variant="horizontal" priority />
        </div>
        <div className="card px-6 py-7">
          <h1 className="text-[22px] font-bold text-ink-muted">Account security</h1>
          <p className="mt-1 text-[14px] text-ink-subtle">Signed in as {user.email}</p>
          {firstParam(sp.required) ? (
            <p className="mt-4 rounded-[6px] border border-[#f0b46b] bg-warn-soft px-3 py-2.5 text-[14px] text-[#8a4300]">
              Your role in this organisation requires multi-factor authentication (HVEMS staff always; company Owners, Administrators and
              Finance once the company has a second member or a saved payment method; Provider Owners once a payment method is saved).
            </p>
          ) : null}
          <div className="mt-6">
            <MfaPanel next={safeNext} />
          </div>
        </div>
        <p className="mt-4 text-center">
          <Link href={safeNext} className="text-[14px] text-link hover:underline">
            Back
          </Link>
        </p>
      </div>
    </div>
  );
}
