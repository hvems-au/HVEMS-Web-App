import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardCheck, MessageSquareWarning } from "lucide-react";
import {
  formatWorkOrderNumber,
  getPersonNames,
  getServicePlanRow,
  getWorkOrder,
  listServiceDueHistory,
  listWorkOrderFiles,
  listWorkOrderReports,
  type WorkOrderReport,
} from "@hvems/api-client";
import { formatDateTimeAU, todayISO } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { PriorityBadge, WorkOrderStatusBadge } from "@/features/maintenance/badges";
import { JobDocuments, type JobDoc } from "@/features/technician/documents";
import { JobSteps, STAGE_TEXT, jobStage } from "@/features/technician/job";
import { POST_CHECKS, PRE_CHECKS } from "@/features/technician/checks";
import { JobReportForm, type DuePrefill } from "@/features/technician/report-form";
import { StartJobButton } from "@/features/technician/start-job";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Job" };

const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const ANSWER = { ok: { tone: "green", text: "OK" }, issue: { tone: "red", text: "Issue" }, na: { tone: "grey", text: "N/A" } } as const;

/** One job, step by step, for the technician doing it. */
export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; woId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, woId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const manager = can(ctx.capabilities, "work_orders.manage");
  if (!manager && !can(ctx.capabilities, "work_orders.work")) notFound();
  const db = await createSupabaseServerClient();
  const w = await getWorkOrder(db, orgId, woId);
  if (!w) notFound();
  const [reports, files, asset, plan, history] = await Promise.all([
    listWorkOrderReports(db, woId),
    listWorkOrderFiles(db, woId),
    db.from("assets").select("meter_type").eq("id", w.asset_id).maybeSingle(),
    w.service_plan_id ? getServicePlanRow(db, w.service_plan_id) : Promise.resolve(null),
    w.service_plan_id ? listServiceDueHistory(db, w.service_plan_id) : Promise.resolve([]),
  ]);
  const names = await getPersonNames(db, [
    ...new Set([w.assigned_to, ...reports.map((r) => r.created_by), ...files.map((f) => f.uploaded_by), ...history.map((h) => h.set_by)].filter(Boolean) as string[]),
  ]);
  const who = (id: string | null) => (id ? (names.get(id) ?? "Former member") : "—");
  const tz = ctx.timezone;
  const today = todayISO(tz);
  const mt = asset.data?.meter_type ?? "none";
  const meters = { km: mt === "kilometres" || mt === "both", hours: mt === "hours" || mt === "both" };
  const pre = reports.find((r) => r.kind === "pre") ?? null;
  const post = reports.find((r) => r.kind === "post") ?? null;
  const stage = jobStage(w, new Set(reports.map((r) => r.kind)));
  const mine = w.assigned_to === ctx.user.id;
  const canWork = manager || mine || !w.assigned_to;
  const base = `/customer/${orgId}/my-work`;
  const reported = firstParam(sp.reported);

  // Signed links to open documents (private bucket, short-lived).
  const signed = files.length ? await db.storage.from("work-order-files").createSignedUrls(files.map((f) => f.path), 3600) : { data: [] };
  const urlOf = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const docs: JobDoc[] = files.map((f) => ({
    id: f.id,
    kind: f.kind,
    fileName: f.file_name,
    supplier: f.supplier,
    reference: f.reference,
    amountCents: f.amount_cents,
    uploadedBy: who(f.uploaded_by),
    uploadedAt: formatDateTimeAU(new Date(f.uploaded_at), tz),
    url: urlOf.get(f.path) ?? null,
    canRemove: manager || (f.uploaded_by === ctx.user.id && w.status !== "closed"),
  }));

  const latestKm = post?.odometer_km ?? pre?.odometer_km ?? plan?.current_km ?? null;
  const latestHours = post?.engine_hours ?? pre?.engine_hours ?? plan?.current_hours ?? null;
  const due: DuePrefill | null = plan
    ? {
        currentOn: plan.next_due_on,
        currentKm: plan.next_due_km,
        currentHours: plan.next_due_hours,
        suggestOn: w.next_due_on ?? (plan.interval_days ? addDays(today, plan.interval_days) : null),
        suggestKm: w.next_due_km ?? (plan.interval_km && latestKm !== null ? Math.round(latestKm + plan.interval_km) : null),
        suggestHours: w.next_due_hours ?? (plan.interval_hours && latestHours !== null ? Math.round(latestHours + plan.interval_hours) : null),
        tracksDays: !!plan.interval_days,
        tracksKm: !!plan.interval_km,
        tracksHours: !!plan.interval_hours,
        history: history.map((h) => ({
          when: formatDateTimeAU(new Date(h.set_at), tz),
          who: who(h.set_by),
          text: [h.next_due_on ? dmy(h.next_due_on) : null, h.next_due_km !== null ? `${h.next_due_km.toLocaleString("en-AU")} km` : null, h.next_due_hours !== null ? `${h.next_due_hours.toLocaleString("en-AU")} h` : null]
            .filter(Boolean)
            .join(" · "),
        })),
      }
    : null;

  return (
    <>
      <BackLink href={base} label="My Jobs" />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold break-words text-ink sm:text-[26px]">{w.title}</h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            {formatWorkOrderNumber(w.number)} ·{" "}
            <Link href={`/customer/${orgId}/equipment/${w.asset_id}`} className="font-medium text-link hover:underline">
              {w.asset?.asset_number}
            </Link>{" "}
            {[w.asset?.make, w.asset?.model].filter(Boolean).join(" ")}
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          <PriorityBadge priority={w.priority} />
          <WorkOrderStatusBadge status={w.status} />
        </span>
      </div>

      {reported ? (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[12px] border border-ok bg-ok-soft px-4 py-3 text-ok-ink">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          <p className="text-[14px]">
            Issue reported. It&apos;s in Defects &amp; Safety for the managers (reference {reported.slice(0, 8).toUpperCase()}).
          </p>
        </div>
      ) : null}

      <Card className="mb-5">
        <CardBody className="flex flex-col gap-3">
          <JobSteps stage={stage} />
          <p className="text-[13.5px] text-ink-muted">{STAGE_TEXT[stage].next}</p>
          {!canWork ? <p className="text-[13.5px] font-medium text-warn-ink">This job is assigned to {who(w.assigned_to)}. You can view it but not work on it.</p> : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          {stage === "pre" && canWork ? (
            <Card>
              <CardHeader title="Pre-work report" description="Before you start: check the equipment and record its condition. Saving starts the job." />
              <CardBody>
                <JobReportForm orgId={orgId} woId={woId} assetId={w.asset_id} kind="pre" meters={meters} />
              </CardBody>
            </Card>
          ) : null}
          {stage === "work" && w.kind === "vendor" && w.status === "open" && canWork ? (
            <Card>
              <CardHeader title="Start the job" description="This is a vendor job; record the work once it's back." />
              <CardBody>
                <StartJobButton orgId={orgId} woId={woId} />
              </CardBody>
            </Card>
          ) : null}
          {pre ? <ReportSummary title="Pre-work report" r={pre} checks={PRE_CHECKS} who={who(pre.created_by)} when={formatDateTimeAU(new Date(pre.updated_at), tz)} /> : null}
          {stage === "work" && w.status === "in_progress" && canWork ? (
            <Card>
              <CardHeader title="Post-work report" description="When the work is done: what you did, labour, costs and the next service. Saving completes the job for review." />
              <CardBody>
                <JobReportForm orgId={orgId} woId={woId} assetId={w.asset_id} kind="post" meters={meters} due={due} />
              </CardBody>
            </Card>
          ) : null}
          {post ? <ReportSummary title="Post-work report" r={post} checks={POST_CHECKS} who={who(post.created_by)} when={formatDateTimeAU(new Date(post.updated_at), tz)} /> : null}

          <Card>
            <CardHeader title="Invoices and documents" description="Parts invoices, receipts and quotes for this job." />
            <CardBody>
              <JobDocuments orgId={orgId} woId={woId} docs={docs} canAdd={canWork && w.status !== "cancelled"} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-5 self-start">
          {w.status !== "closed" && w.status !== "cancelled" ? (
            <div className="flex flex-col gap-2">
              <Button asChild variant="secondary" className="justify-start">
                <Link href={`${base}/${woId}/issue`}>
                  <MessageSquareWarning /> Report an issue on this equipment
                </Link>
              </Button>
              <Button asChild variant="ghost" className="justify-start">
                <Link href={`/customer/${orgId}/equipment/${w.asset_id}/prestart`}>
                  <ClipboardCheck /> Pre-start for this equipment
                </Link>
              </Button>
            </div>
          ) : null}
          <Card>
            <CardHeader title="Job details" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-[14px]">
                <Detail label="What's needed">{w.description ? <span className="whitespace-pre-wrap">{w.description}</span> : "—"}</Detail>
                <Detail label="Assigned to">{w.kind === "vendor" ? `Vendor: ${w.vendor_name}` : w.assigned_to ? who(w.assigned_to) : "Nobody yet"}</Detail>
                <Detail label="Due">{w.due_on ? <span className={w.due_on < today && (w.status === "open" || w.status === "in_progress") ? "font-semibold text-danger-ink" : ""}>{dmy(w.due_on)}</span> : "—"}</Detail>
                {plan ? (
                  <Detail label="Service">
                    {plan.name}
                    <span className="block text-[12.5px] text-ink-muted">
                      Next due {[plan.next_due_on ? dmy(plan.next_due_on) : null, plan.next_due_km !== null ? `${plan.next_due_km.toLocaleString("en-AU")} km` : null, plan.next_due_hours !== null ? `${plan.next_due_hours.toLocaleString("en-AU")} h` : null].filter(Boolean).join(" · ") || "—"}
                      {plan.next_due_chosen ? " (chosen at the last service)" : ""}
                    </span>
                  </Detail>
                ) : null}
                {w.close_note ? <Detail label="Manager's note">{w.close_note}</Detail> : null}
              </dl>
            </CardBody>
          </Card>
          {manager ? (
            <Link href={`/customer/${orgId}/work-orders/${woId}`} className="px-1 text-[13px] font-medium text-link hover:underline">
              Open in Work Orders (manager view) →
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function ReportSummary({ title, r, checks, who, when }: { title: string; r: WorkOrderReport; checks: readonly { id: string; label: string }[]; who: string; when: string }) {
  const issues = checks.filter((c) => r.checks[c.id] === "issue").length;
  return (
    <Card>
      <CardHeader
        title={title}
        description={`${who} · ${when}`}
        action={issues ? <Badge tone="red">{issues} issue{issues === 1 ? "" : "s"}</Badge> : <Badge tone="green">All checks OK</Badge>}
      />
      <CardBody className="flex flex-col gap-3">
        <p className="text-[14px] whitespace-pre-wrap text-ink">{r.notes}</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {checks.map((c) => {
            const a = r.checks[c.id];
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-[8px] bg-surface-muted px-3 py-1.5 text-[13px]">
                <span className="text-ink">{c.label}</span>
                {a ? <Badge tone={ANSWER[a].tone}>{ANSWER[a].text}</Badge> : <span className="text-ink-subtle">—</span>}
              </li>
            );
          })}
        </ul>
        <p className="text-[12.5px] text-ink-muted">
          {[r.odometer_km !== null ? `${r.odometer_km.toLocaleString("en-AU")} km` : null, r.engine_hours !== null ? `${r.engine_hours.toLocaleString("en-AU")} h` : null, r.photo_paths.length ? `${r.photo_paths.length} photo${r.photo_paths.length === 1 ? "" : "s"}` : null]
            .filter(Boolean)
            .join(" · ") || "No readings or photos"}
        </p>
      </CardBody>
    </Card>
  );
}
