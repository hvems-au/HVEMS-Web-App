import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, OctagonAlert, TriangleAlert } from "lucide-react";
import { getInspection } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { ResultBadge, SeverityBadge } from "@/components/safety";
import { Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Pre-start" };

/** One of the operator's own pre-starts: outcome, faults, readings and every answer. Records can't be changed. */
export default async function MyPrestart({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; inspectionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, inspectionId }, sp] = await Promise.all([params, searchParams]);
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/prestarts/${inspectionId}`);
  const db = await createSupabaseServerClient();
  const data = await getInspection(db, inspectionId).catch(() => null);
  // Only the operator's own pre-starts, in this company.
  if (!data || data.inspection.organisation_id !== orgId || data.inspection.submitted_by !== ctx.user.id) notFound();
  const { inspection: i, answers, photos, defects } = data;
  const h = i.header as { asset_number?: string; make?: string; model?: string };
  const faults = answers.filter((a) => a.answer === "fault");
  const justSubmitted = firstParam(sp.submitted) === "1";

  return (
    <>
      <Link href={`${base}/prestarts`} className="mb-2 inline-block text-[13px] font-medium text-ink-muted hover:text-link">
        ← My pre-starts
      </Link>
      {justSubmitted ? (
        <div
          role="status"
          className={cn(
            "mb-4 flex items-start gap-3 rounded-[12px] border-2 px-4 py-3.5",
            i.result === "fail" ? "border-danger bg-danger-soft text-danger-ink" : i.result === "pass_with_faults" ? "border-warn-line bg-warn-soft text-warn-ink" : "border-ok bg-ok-soft text-ok-ink",
          )}
        >
          {i.result === "fail" ? <OctagonAlert className="size-6 shrink-0" /> : i.result === "pass_with_faults" ? <TriangleAlert className="size-6 shrink-0" /> : <CheckCircle2 className="size-6 shrink-0" />}
          <div>
            <p className="text-[16px] font-bold">
              {i.result === "fail" ? "Submitted. Do not operate this equipment." : i.result === "pass_with_faults" ? "Submitted with faults" : "Submitted: passed"}
            </p>
            <p className="mt-0.5 text-[14px]">
              {i.result === "fail"
                ? "A critical fault was recorded. Managers have been alerted. The equipment stays out of service until it's repaired and cleared."
                : i.result === "pass_with_faults"
                  ? "The faults are recorded and managers have been told."
                  : "No faults recorded. Thanks for checking."}
            </p>
            <p className="mt-1 text-[12.5px] opacity-90">Reference {i.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Pre-start · {h.asset_number}</h1>
          <p className="text-[14px] text-ink-muted">{formatDateTimeAU(new Date(i.submitted_at), ctx.timezone)}</p>
        </div>
        <ResultBadge result={i.result} />
      </div>
      {faults.length ? (
        <Card className="mb-4 border-danger-line">
          <CardHeader title={`Faults (${faults.length})`} />
          <ul className="mt-2 divide-y divide-stroke">
            {faults.map((a) => (
              <li key={a.id} className="px-5 py-3 text-[14px]">
                <p className="font-medium text-ink">{a.prompt}</p>
                {a.note ? <p className="mt-0.5 text-ink-muted">“{a.note}”</p> : null}
                {a.severity ? (
                  <div className="mt-1">
                    <SeverityBadge severity={a.severity} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card className="mb-4">
        <CardBody>
          <Dl
            className="grid-cols-2"
            items={[
              { label: "Equipment", value: [h.asset_number, h.make, h.model].filter(Boolean).join(" ") },
              ...(i.odometer_km !== null ? [{ label: "Odometer", value: `${formatNumber(i.odometer_km, 1)} km` }] : []),
              ...(i.engine_hours !== null ? [{ label: "Hour meter", value: `${formatNumber(i.engine_hours, 1)} hours` }] : []),
              { label: "Defects raised", value: defects.length ? defects.map((d) => d.title).join(", ") : "None" },
              { label: "Photos", value: photos.length ? `${photos.length} attached` : "None" },
              ...(i.notes ? [{ label: "Notes", value: i.notes }] : []),
            ]}
          />
        </CardBody>
      </Card>
      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-semibold text-ink">All answers</span>
          <span className="text-[13px] text-ink-muted">{answers.length} items</span>
        </summary>
        <ul className="divide-y divide-stroke border-t border-stroke">
          {answers.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[14px]">
              <span className="text-ink">{a.prompt}</span>
              <span className={cn("shrink-0 font-semibold", a.answer === "fault" ? "text-danger-ink" : a.answer === "ok" ? "text-ok-ink" : "text-ink-muted")}>
                {a.answer === "fault" ? "Fault" : a.answer === "ok" ? "OK" : "N/A"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
