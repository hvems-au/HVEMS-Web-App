import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileDown, OctagonAlert, TriangleAlert } from "lucide-react";
import { getInspection, signInspectionPhotos } from "@hvems/api-client";
import { RECORDS_ONLY_NOTICE, formatDateTimeAU } from "@hvems/domain";
import { ResultBadge, SeverityBadge } from "@/components/safety";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Pre-start record" };

const ANSWER = {
  ok: { label: "OK", tone: "green" },
  fault: { label: "Fault", tone: "red" },
  na: { label: "N/A", tone: "grey" },
} as const;

/** A submitted pre-start: read-only, exactly as answered (the record never changes). */
export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; inspectionId: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const [{ orgId, inspectionId }, { submitted }] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const data = await getInspection(db, inspectionId).catch(() => null);
  if (!data || data.inspection.organisation_id !== orgId) notFound();
  const { inspection: i, answers, photos, defects } = data;
  const urls = await signInspectionPhotos(db, photos.map((p) => p.storage_path)).catch(() => ({}) as Record<string, string>);
  const h = i.header;
  const tz = ctx.timezone;
  const assetHref = `/customer/${orgId}/equipment/${i.asset_id}`;
  const faults = answers.filter((a) => a.answer === "fault");
  const photosFor = (code: string | null) => photos.filter((p) => p.item_code === code);
  const sections = answers.reduce<{ name: string; items: typeof answers }[]>((acc, a) => {
    const last = acc[acc.length - 1];
    if (last && last.name === a.template_name) last.items.push(a);
    else acc.push({ name: a.template_name, items: [a] });
    return acc;
  }, []);

  const thumbs = (code: string | null) => {
    const list = photosFor(code).filter((p) => urls[p.storage_path]);
    if (!list.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((p) => (
          <a key={p.id} href={urls[p.storage_path]} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-[8px] border border-stroke">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img src={urls[p.storage_path]} alt={`Photo ${code ?? ""}`} className="size-full object-cover" />
          </a>
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={`Pre-start · ${h.asset_number}`}
        description={`${formatDateTimeAU(new Date(i.submitted_at), tz)} · ${h.operator_name ?? "Unknown operator"}`}
        breadcrumb={{ label: "Inspections", href: `/customer/${orgId}/inspections` }}
        actions={
          <>
            <ResultBadge result={i.result} />
            <Button asChild variant="secondary">
              {/* A plain link: the PDF is a download, not a page to prefetch. */}
              <a href={`/customer/${orgId}/inspections/${i.id}/pdf`} download>
                <FileDown /> Download PDF
              </a>
            </Button>
          </>
        }
      />

      {submitted ? (
        <div
          className={
            i.result === "fail"
              ? "mb-5 flex items-start gap-3 rounded-[12px] border-2 border-danger bg-danger-soft px-5 py-4 text-[#9b0b0c]"
              : i.result === "pass_with_faults"
                ? "mb-5 flex items-start gap-3 rounded-[12px] border-2 border-[#e8a33c] bg-warn-soft px-5 py-4 text-[#7a3d00]"
                : "mb-5 flex items-start gap-3 rounded-[12px] border-2 border-ok bg-[#e8f7e7] px-5 py-4 text-[#0a6b00]"
          }
          role="status"
        >
          {i.result === "fail" ? <OctagonAlert className="size-7 shrink-0" /> : i.result === "pass_with_faults" ? <TriangleAlert className="size-7 shrink-0" /> : <CheckCircle2 className="size-7 shrink-0" />}
          <div>
            <p className="text-h5 font-bold">
              {i.result === "fail" ? "Do not operate this equipment" : i.result === "pass_with_faults" ? "Pre-start submitted with faults" : "Pre-start passed"}
            </p>
            <p className="mt-1 text-[14px]">
              {i.result === "fail"
                ? i.operator_fault
                  ? "You told us you're not fit or not licensed for this equipment. Speak to your supervisor before operating anything."
                  : "A critical fault was recorded. The equipment is now out of service until it's repaired and cleared. Your Owner and Fleet Managers have been told."
                : i.result === "pass_with_faults"
                  ? "The faults are recorded. Follow your company's procedure; managers have been told about any Minor faults."
                  : "No faults recorded. Thanks for checking."}
            </p>
            <p className="mt-2 text-[12px] opacity-80">{RECORDS_ONLY_NOTICE}</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Equipment at the time" action={<Link href={assetHref} className="text-[13px] font-semibold text-link hover:underline">Open equipment</Link>} />
          <CardBody>
            <Dl
              className="grid-cols-2 sm:grid-cols-3"
              items={[
                { label: "Equipment ID", value: h.asset_number },
                { label: "Class", value: h.asset_class ?? "—" },
                { label: "Make / Model", value: [h.make, h.model].filter(Boolean).join(" ") || "—" },
                { label: "Rego", value: h.registration_number ? `${h.registration_number} ${h.registration_state ?? ""}`.trim() : "—" },
                { label: "VIN / Serial", value: h.vin ?? h.serial_number ?? "—" },
                { label: "Operator", value: h.operator_name ?? "—" },
                ...(i.odometer_km !== null
                  ? [{ label: "Odometer", value: `${formatNumber(i.odometer_km, 1)} km${h.last_odometer_km !== null ? ` (was ${formatNumber(h.last_odometer_km, 1)})` : ""}` }]
                  : []),
                ...(i.engine_hours !== null
                  ? [{ label: "Hour meter", value: `${formatNumber(i.engine_hours, 1)} hours${h.last_engine_hours !== null ? ` (was ${formatNumber(h.last_engine_hours, 1)})` : ""}` }]
                  : []),
                { label: "Checklist", value: i.templates.map((t) => `${t.name} v${t.version}`).join(", ") },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Outcome" />
          <CardBody className="flex flex-col gap-3 text-[14px]">
            <p>
              <strong>{faults.length}</strong> fault{faults.length === 1 ? "" : "s"} of {answers.length} items.
            </p>
            {defects.length ? (
              <ul className="flex flex-col gap-1.5">
                {defects.map((d) => (
                  <li key={d.id} className="flex items-start gap-2">
                    <SeverityBadge severity={d.severity} /> <span>{d.title}</span>
                  </li>
                ))}
              </ul>
            ) : faults.length ? (
              <p className="text-ink-muted">The faults were already reported as open defects, so no new defects were raised.</p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {faults.length ? (
        <Card className="mt-5">
          <CardHeader title="Faults" />
          <CardBody className="flex flex-col divide-y divide-stroke px-0 pb-0">
            {faults.map((a) => (
              <div key={a.id} className="px-5 py-3">
                <p className="text-[14.5px] font-medium text-ink">
                  <span className="mr-1.5 text-[12px] font-semibold text-ink-subtle">{a.item_code}</span>
                  {a.prompt}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {a.operator_item ? <Badge tone="blue">About the operator</Badge> : <SeverityBadge severity={a.severity} />}
                </div>
                {a.note ? <p className="mt-1.5 text-[14px] text-ink-muted">“{a.note}”</p> : null}
                {thumbs(a.item_code)}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {i.notes || photosFor(null).length ? (
        <Card className="mt-5">
          <CardHeader title="Notes and photos" />
          <CardBody>
            {i.notes ? <p className="whitespace-pre-wrap text-[14px] text-ink">{i.notes}</p> : null}
            {thumbs(null)}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardHeader title="All answers" />
        <CardBody className="flex flex-col gap-4">
          {sections.map((s) => (
            <div key={s.name}>
              <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-subtle">{s.name}</h3>
              <ul className="flex flex-col divide-y divide-stroke rounded-[10px] border border-stroke">
                {s.items.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[14px]">
                    <span>
                      <span className="mr-1.5 text-[12px] font-semibold text-ink-subtle">{a.item_code}</span>
                      {a.prompt}
                    </span>
                    <Badge tone={ANSWER[a.answer].tone}>{ANSWER[a.answer].label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
