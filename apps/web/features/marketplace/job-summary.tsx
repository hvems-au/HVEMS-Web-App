import { AlertTriangle, MapPin, Paperclip } from "lucide-react";
import type { PublicJob } from "@hvems/api-client";
import { Badge } from "@/components/ui/primitives";
import { BADGE_LABELS, JOB_STATUS, JOB_TYPES, PROVIDER_CATEGORIES, SHARE_FIELDS, aud, budgetText, dmy, windowText } from "./labels";

const ASSET_LABEL: Record<string, string> = { ...Object.fromEntries(SHARE_FIELDS.map((f) => [f.key, f.label])), description: "Description" };

/** HVEMS is not an emergency service (SoW 4.6): shown on every urgent job. */
export function UrgentNotice() {
  return (
    <p className="flex items-start gap-2 rounded-[10px] border border-danger/40 bg-danger-soft p-3 text-[13.5px] text-danger-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong>Urgent job.</strong> HVEMS is not an emergency or dispatch service and can&apos;t guarantee a provider will respond. Alerts go by email and in the app only. If
        anyone is in danger, call 000 first.
      </span>
    </p>
  );
}

/**
 * A job exactly as providers see it (MKT-04): the poster's preview and the provider's page both use this,
 * with the data from the same database function, so nothing private can appear here.
 */
export function JobSummary({ job, fileLinks }: { job: PublicJob; fileLinks?: Map<string, string> }) {
  const asset = Object.entries(job.shared_asset ?? {});
  const s = JOB_STATUS[job.status];
  return (
    <div className="flex flex-col gap-4">
      {job.urgency === "urgent" ? <UrgentNotice /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.tone}>{s.label}</Badge>
        {job.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : null}
        <Badge tone="grey">{PROVIDER_CATEGORIES[job.category]}</Badge>
        <Badge tone="grey">{JOB_TYPES[job.job_type]}</Badge>
        {job.invited_only ? <Badge tone="blue">Invitation only</Badge> : null}
      </div>
      <p className="text-[14.5px] whitespace-pre-wrap text-ink">{job.description}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-[12.5px] text-ink-subtle">Location</dt>
          <dd className="flex items-center gap-1.5 text-ink">
            <MapPin className="size-4 text-ink-muted" aria-hidden /> {job.suburb}
            {job.postcode ? ` ${job.postcode}` : ""}
            {job.region ? ` · ${job.region}` : ""}
          </dd>
          <dd className="text-[12.5px] text-ink-subtle">The exact address is shared once an engagement is confirmed.</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink-subtle">Posted by</dt>
          <dd className="text-ink">{job.poster}</dd>
        </div>
        {windowText(job) ? (
          <div>
            <dt className="text-[12.5px] text-ink-subtle">Preferred date or time</dt>
            <dd className="text-ink">{windowText(job)}</dd>
          </div>
        ) : null}
        {budgetText(job) ? (
          <div>
            <dt className="text-[12.5px] text-ink-subtle">Budget</dt>
            <dd className="text-ink">{budgetText(job)}</dd>
          </div>
        ) : null}
        {job.required_badges.length ? (
          <div>
            <dt className="text-[12.5px] text-ink-subtle">Required verification</dt>
            <dd className="text-ink">{job.required_badges.map((b) => BADGE_LABELS[b] ?? b).join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[12.5px] text-ink-subtle">Open until</dt>
          <dd className="text-ink">{dmy(job.closes_at)}</dd>
        </div>
      </dl>
      {asset.length ? (
        <div className="rounded-[10px] border border-stroke p-3.5">
          <p className="mb-2 text-[12.5px] font-medium text-ink-subtle">Equipment</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-3">
            {asset.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-ink-subtle">{ASSET_LABEL[k] ?? k}</dt>
                <dd className="text-ink">{typeof v === "number" ? v.toLocaleString("en-AU") : v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {job.files.length ? (
        <ul className="flex flex-wrap gap-2">
          {job.files.map((f) => (
            <li key={f.id}>
              {fileLinks?.get(f.path) ? (
                <a href={fileLinks.get(f.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-stroke-strong px-3 py-1 text-[13px] text-link hover:underline">
                  <Paperclip className="size-3.5" aria-hidden /> {f.file_name}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke-strong px-3 py-1 text-[13px]">
                  <Paperclip className="size-3.5" aria-hidden /> {f.file_name}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[12.5px] text-ink-subtle">
        Connection fee if a proposal is accepted: {aud(job.fee_cents)} for each party ({job.urgency === "urgent" ? "urgent" : "standard"} job).
      </p>
    </div>
  );
}
