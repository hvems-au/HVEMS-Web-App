import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { Badge, Card, CardBody, Dl } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { ISSUE_COLUMNS, URGENCY_LABEL, issueProgress, type OperatorIssue } from "@/features/operator/issues";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Reported issue" };

/** One issue the operator reported: what they said and where it's up to (no internal notes). */
export default async function MyIssue({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; defectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, defectId }, sp] = await Promise.all([params, searchParams]);
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/issues/${defectId}`);
  const db = await createSupabaseServerClient();
  const { data } = await db.from("defects").select(ISSUE_COLUMNS).eq("id", defectId).eq("organisation_id", orgId).eq("reported_by", ctx.user.id).maybeSingle();
  const d = data as unknown as OperatorIssue | null;
  if (!d) notFound();
  const p = issueProgress(d);
  const justSent = firstParam(sp.submitted) === "1";

  return (
    <>
      <Link href={`${base}/issues`} className="mb-2 inline-block text-[13px] font-medium text-ink-muted hover:text-link">
        ← My reported issues
      </Link>
      {justSent ? (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[12px] border-2 border-ok bg-ok-soft px-4 py-3.5 text-ok-ink">
          <CheckCircle2 className="size-6 shrink-0" aria-hidden />
          <div>
            <p className="text-[16px] font-bold">Report sent</p>
            <p className="mt-0.5 text-[14px]">
              {d.reported_urgency === "stop"
                ? "The equipment is now out of service and managers have been alerted. Don't use it until it's been cleared."
                : "Managers have been told and will review it."}
            </p>
            <p className="mt-1 text-[12.5px] opacity-90">Reference {d.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold break-words text-ink">{d.title}</h1>
          <p className="text-[14px] text-ink-muted">
            {d.asset?.asset_number} · reported {formatDateTimeAU(new Date(d.reported_at), ctx.timezone)}
          </p>
        </div>
        <Badge tone={p.tone}>{p.label}</Badge>
      </div>
      <Card className="mb-4">
        <CardBody className="text-[14px] text-ink">
          <p className="font-semibold">Where it&apos;s up to</p>
          <p className="mt-0.5 text-ink-muted">{p.help}</p>
          {d.deferred_until && d.status === "open" ? (
            <p className="mt-1 text-ink-muted">Repair planned by {formatDateAU(new Date(`${d.deferred_until}T00:00:00Z`), "UTC")}.</p>
          ) : null}
          {d.closed_at ? <p className="mt-1 text-ink-muted">Finished {formatDateTimeAU(new Date(d.closed_at), ctx.timezone)}.</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <Dl
            className="grid-cols-1 sm:grid-cols-2"
            items={[
              { label: "Equipment", value: [d.asset?.asset_number, d.asset?.make, d.asset?.model].filter(Boolean).join(" ") },
              { label: "You said", value: d.reported_urgency ? URGENCY_LABEL[d.reported_urgency] : "—" },
              { label: "Details", value: d.description ?? "—" },
              { label: "Photos", value: d.evidence_paths?.length ? `${d.evidence_paths.length} attached` : "None" },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
