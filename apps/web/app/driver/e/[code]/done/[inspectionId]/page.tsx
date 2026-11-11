import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, OctagonAlert, TriangleAlert } from "lucide-react";
import { RECORDS_ONLY_NOTICE, formatDateTimeAU } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { driverSignOutAction } from "../../../../actions";

export const metadata: Metadata = { title: "Pre-start submitted" };

/** The operator's result: what to do now, then sign out (phones are often shared). */
export default async function DriverDonePage({ params }: { params: Promise<{ code: string; inspectionId: string }> }) {
  const { code, inspectionId } = await params;
  const db = await createSupabaseServerClient();
  const { data: i } = await db.from("inspections").select("id, result, operator_fault, submitted_at, header").eq("id", inspectionId).maybeSingle();
  if (!i) {
    return (
      <p className="text-[15px] text-ink-muted">
        Pre-start not found. <Link href={`/driver/e/${code}`} className="text-link underline">Back</Link>
      </p>
    );
  }
  const result = i.result as "pass" | "pass_with_faults" | "fail";
  const tone =
    result === "fail"
      ? "border-danger bg-danger-soft text-[#9b0b0c]"
      : result === "pass_with_faults"
        ? "border-[#e8a33c] bg-warn-soft text-[#7a3d00]"
        : "border-ok bg-[#e8f7e7] text-[#0a6b00]";
  const Icon = result === "fail" ? OctagonAlert : result === "pass_with_faults" ? TriangleAlert : CheckCircle2;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <div className={`rounded-[14px] border-2 px-5 py-6 text-center ${tone}`} role="status">
        <Icon className="mx-auto size-12" aria-hidden />
        <p className="mt-2 text-h3 font-bold">
          {result === "fail" ? "Do not operate" : result === "pass_with_faults" ? "Submitted with faults" : "Pre-start passed"}
        </p>
        <p className="mt-2 text-[15px]">
          {result === "fail"
            ? i.operator_fault
              ? "Speak to your supervisor before operating any equipment."
              : "A critical fault was recorded. The equipment is out of service and your managers have been told."
            : result === "pass_with_faults"
              ? "The faults are recorded. Follow your company's procedure."
              : "No faults recorded. Thanks for checking."}
        </p>
        <p className="mt-3 text-[13px] opacity-80">
          {(i.header as { asset_number?: string }).asset_number} · {formatDateTimeAU(new Date(i.submitted_at as string), "Australia/Brisbane")}
        </p>
      </div>
      <form action={driverSignOutAction.bind(null, code)}>
        <Button type="submit" size="lg" className="w-full">
          Sign out
        </Button>
      </form>
      <p className="text-center text-[12px] text-ink-subtle">{RECORDS_ONLY_NOTICE}</p>
    </div>
  );
}
