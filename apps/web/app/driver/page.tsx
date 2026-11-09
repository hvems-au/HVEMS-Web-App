import type { Metadata } from "next";
import { Construction, KeyRound, QrCode } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Driver Sign-in" };

/**
 * Driver portal (ADR-009). Drivers have no email login: they scan the
 * equipment code (or type it), then enter their Driver ID and 6-digit PIN
 * (spec ACC-11, ACC-12). Driver profiles and PIN sessions are built in
 * increment 2B, so this page only states what is coming. No mock form.
 */
export default function DriverPortalPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[460px] rounded-[18px] border border-stroke bg-white px-6 py-9 shadow-sm sm:px-10">
        <div className="mx-auto w-[200px]">
          <Logo variant="horizontal" priority />
        </div>
        <h1 className="mt-6 text-center text-h2 text-ink">Driver Sign-in</h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-[15px] text-ink-subtle">
          Pre-starts, inspections and issue reports for the vehicles and machines you&apos;re permitted to operate.
        </p>
        <ol className="mt-8 flex flex-col gap-4 text-[14.5px] text-ink">
          <li className="flex gap-3">
            <QrCode className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span>Scan the HVEMS label on the vehicle or machine, or type the 10-character code printed under it.</span>
          </li>
          <li className="flex gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span>Enter your Driver ID and 6-digit PIN. Your company sets these up for you; drivers don&apos;t need an email address.</span>
          </li>
        </ol>
        <div className="mt-8 flex items-start gap-3 rounded-[10px] bg-warn-soft px-4 py-3 text-[13.5px] text-ink">
          <Construction className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <span>Driver sign-in goes live with increment 2B (driver profiles, equipment codes and pre-starts).</span>
        </div>
        <p className="mt-6 text-center text-[13px] font-semibold text-ink-subtle">If anyone is injured or in danger, call 000 first.</p>
      </div>
    </div>
  );
}
