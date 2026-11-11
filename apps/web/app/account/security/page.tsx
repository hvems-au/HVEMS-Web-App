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
  const required = !!firstParam(sp.required);
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mx-auto mb-8 w-44">
          <Logo variant="horizontal" priority />
        </div>
        <div className="card px-6 py-7">
          <h1 className="text-h1 text-ink">{required ? "MFA required" : "Account security"}</h1>
          <p className="mt-1 text-[14px] text-ink-subtle">Signed in as {user.email}</p>
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
