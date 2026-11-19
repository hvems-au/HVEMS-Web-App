"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Paperclip, X } from "lucide-react";
import type { MarketplaceRegion, PublicJob } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { postJobAction, registerInterestAction } from "./actions";
import { JobSummary } from "./job-summary";
import { BADGE_LABELS, JOB_TYPES, PROVIDER_CATEGORIES, SHARE_FIELDS, aud, type JobType, type ProviderCategory } from "./labels";

export type PostAsset = { value: string; label: string; details: Record<string, string | number | null> };

const STEPS = ["Job details", "Equipment and location", "Requirements", "Review and post"] as const;

/**
 * Post a job in four steps (MKT-04). Step 4 shows exactly what providers will see, built with the same
 * component providers use, and the connection fee that applies if a proposal is accepted.
 */
export function PostJobForm({
  orgId,
  kind,
  regions,
  assets,
  fees,
  prefill,
}: {
  orgId: string;
  kind: "company" | "marketplace_customer";
  regions: MarketplaceRegion[];
  assets: PostAsset[];
  fees: { standard: number; urgent: number };
  prefill?: { workOrderId?: string; assetId?: string; title?: string; description?: string; urgent?: boolean };
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [f, setF] = React.useState({
    title: prefill?.title ?? "",
    description: prefill?.description ?? "",
    category: "" as ProviderCategory | "",
    job_type: (prefill?.workOrderId ? "breakdown_repair" : "") as JobType | "",
    urgency: (prefill?.urgent ? "urgent" : "standard") as "standard" | "urgent",
    asset_id: prefill?.assetId ?? "",
    share: ["class", "make", "model"] as string[],
    asset_description: { class: "", make: "", model: "", registration: "", description: "" },
    region_code: "",
    suburb: "",
    postcode: "",
    address: "",
    site_access_notes: "",
    preferred_from: "",
    preferred_to: "",
    preferred_time: "",
    budget_min: "",
    budget_max: "",
    required_badges: [] as string[],
    show_poster_name: false,
    invited_only: false,
  });
  const [files, setFiles] = React.useState<{ path: string; file_name: string; content_type: string; shared: boolean }[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [interest, setInterest] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const asset = assets.find((a) => a.value === f.asset_id);
  const region = regions.find((r) => r.code === f.region_code);

  function check(s: number): string | null {
    if (s === 0) {
      if (f.title.trim().length < 3) return "Give the job a title.";
      if (f.description.trim().length < 10) return "Describe the job (at least 10 characters).";
      if (!f.category) return "Choose the service needed.";
      if (!f.job_type) return "Choose the job type.";
    }
    if (s === 1) {
      if (kind === "company" && !f.asset_id) return "Choose the equipment.";
      if (kind === "marketplace_customer" && !Object.values(f.asset_description).some((v) => v.trim())) return "Describe the vehicle or equipment.";
      if (!f.region_code) return "Choose the region.";
      if (region && !region.open) return "The marketplace isn't open in this region yet.";
      if (f.suburb.trim().length < 2) return "Enter the suburb.";
    }
    return null;
  }

  // What providers will see (same shape as the database's public view).
  const preview: PublicJob = {
    id: "preview",
    number: 0,
    title: f.title,
    description: f.description,
    category: (f.category || "other") as ProviderCategory,
    job_type: (f.job_type || "other") as JobType,
    urgency: f.urgency,
    shared_asset:
      kind === "company"
        ? Object.fromEntries(f.share.flatMap((k) => (asset?.details[k] !== null && asset?.details[k] !== undefined && asset.details[k] !== "" ? [[k, asset.details[k] as string | number]] : [])))
        : Object.fromEntries(Object.entries(f.asset_description).filter(([, v]) => v.trim())),
    region_code: f.region_code,
    region: region?.name ?? null,
    suburb: f.suburb,
    postcode: f.postcode || null,
    preferred_from: f.preferred_from || null,
    preferred_to: f.preferred_to || null,
    preferred_time: f.preferred_time || null,
    budget_min_cents: f.budget_min ? Math.round(Number(f.budget_min) * 100) : null,
    budget_max_cents: f.budget_max ? Math.round(Number(f.budget_max) * 100) : null,
    required_badges: f.required_badges,
    invited_only: f.invited_only,
    status: "open",
    posted_at: new Date(now).toISOString(),
    closes_at: new Date(now + (f.urgency === "urgent" ? 24 * 3600000 : 14 * 86400000)).toISOString(),
    poster: f.show_poster_name ? "Your organisation's name" : kind === "company" ? "Fleet company" : "Equipment owner",
    poster_kind: kind,
    fee_cents: f.urgency === "urgent" ? fees.urgent : fees.standard,
    files: files.filter((x) => x.shared).map((x, i) => ({ id: String(i), file_name: x.file_name, path: x.path })),
  };

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    const db = getSupabaseBrowserClient();
    for (const file of Array.from(list).slice(0, 10 - files.length)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 25 MB`);
        continue;
      }
      const path = `${orgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      const { error: e } = await db.storage.from("marketplace-files").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (e) toast.error(`${file.name} didn't upload. Use a PDF or photo.`);
      else setFiles((cur) => [...cur, { path, file_name: file.name, content_type: file.type, shared: true }]);
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "rounded-[10px] border px-3 py-2 text-[13px] font-medium",
              i === step ? "border-brand bg-brand-soft text-brand-ink" : i < step ? "border-stroke text-ink" : "border-stroke text-ink-subtle",
            )}
          >
            <span className="mr-1.5 font-mono">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {error ? <FormAlert>{error}</FormAlert> : null}

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="pj-title" required>
            <Input id="pj-title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={160} placeholder="e.g. Excavator won't start" />
          </Field>
          <Field label="What needs doing?" htmlFor="pj-desc" required>
            <Textarea id="pj-desc" rows={5} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Service needed" htmlFor="pj-cat" required>
              <Select id="pj-cat" value={f.category} onChange={(e) => set("category", e.target.value as ProviderCategory)}>
                <option value="">Choose…</option>
                {(Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {PROVIDER_CATEGORIES[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job type" htmlFor="pj-type" required>
              <Select id="pj-type" value={f.job_type} onChange={(e) => set("job_type", e.target.value as JobType)}>
                <option value="">Choose…</option>
                {(Object.keys(JOB_TYPES) as JobType[]).map((k) => (
                  <option key={k} value={k}>
                    {JOB_TYPES[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Urgency" htmlFor="pj-urg">
              <Select id="pj-urg" value={f.urgency} onChange={(e) => set("urgency", e.target.value as "standard" | "urgent")}>
                <option value="standard">Standard (open 14 days)</option>
                <option value="urgent">Urgent (open 24 hours)</option>
              </Select>
            </Field>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          {kind === "company" ? (
            <>
              <Field label="Equipment" htmlFor="pj-asset" required>
                <SearchableSelect id="pj-asset" name="asset" label="Equipment" all="Choose equipment…" allowEmpty={false} value={f.asset_id} options={assets} onChange={(v) => set("asset_id", v)} />
              </Field>
              {asset ? (
                <Field label="Details to share with providers" htmlFor="pj-share" hint="Unticked details are never shown to providers">
                  <div id="pj-share" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {SHARE_FIELDS.map((s) => {
                      const v = asset.details[s.key];
                      if (v === null || v === undefined || v === "") return null;
                      return (
                        <label key={s.key} className="flex items-start gap-2 text-[13.5px]">
                          <input
                            type="checkbox"
                            checked={f.share.includes(s.key)}
                            onChange={(e) => set("share", e.target.checked ? [...f.share, s.key] : f.share.filter((x) => x !== s.key))}
                            className="mt-0.5 size-4 accent-[var(--brand)]"
                          />
                          <span>
                            {s.label}: <span className="text-ink-muted">{typeof v === "number" ? v.toLocaleString("en-AU") : v}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              ) : null}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["class", "make", "model", "registration"] as const).map((k) => (
                <Field key={k} label={k === "class" ? "Type of vehicle or equipment" : k.charAt(0).toUpperCase() + k.slice(1)} htmlFor={`pj-ad-${k}`}>
                  <Input id={`pj-ad-${k}`} value={f.asset_description[k]} onChange={(e) => set("asset_description", { ...f.asset_description, [k]: e.target.value })} maxLength={80} />
                </Field>
              ))}
              <Field label="Anything else that identifies it" htmlFor="pj-ad-desc" className="sm:col-span-2">
                <Input id="pj-ad-desc" value={f.asset_description.description} onChange={(e) => set("asset_description", { ...f.asset_description, description: e.target.value })} maxLength={500} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Region" htmlFor="pj-region" required>
              <Select id="pj-region" value={f.region_code} onChange={(e) => set("region_code", e.target.value)}>
                <option value="">Choose…</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                    {r.open ? "" : " (not open yet)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Suburb (shown to providers)" htmlFor="pj-suburb" required>
              <Input id="pj-suburb" value={f.suburb} onChange={(e) => set("suburb", e.target.value)} maxLength={80} />
            </Field>
            <Field label="Postcode" htmlFor="pj-pc">
              <Input id="pj-pc" inputMode="numeric" value={f.postcode} onChange={(e) => set("postcode", e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
          </div>
          {region && !region.open ? (
            <div className="rounded-[10px] border border-warn-line bg-warn-soft p-3.5 text-[14px] text-warn-ink">
              <p>The marketplace isn&apos;t available in {region.name} yet. Register your interest and we&apos;ll let HVEMS know.</p>
              {interest ? (
                <p className="mt-2 font-medium">{interest}</p>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={!f.suburb.trim()}
                  onClick={async () => {
                    const res = await registerInterestAction(orgId, f.suburb, f.postcode, `${region.name}: ${f.title}`);
                    setInterest(res.status === "error" ? res.message : "Thanks, your interest has been recorded.");
                  }}
                >
                  Register interest
                </Button>
              )}
            </div>
          ) : null}
          <Field label="Exact address" htmlFor="pj-addr" hint="Private: shared only with the provider you engage">
            <Input id="pj-addr" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={300} />
          </Field>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Preferred from" htmlFor="pj-from">
              <Input id="pj-from" type="date" value={f.preferred_from} onChange={(e) => set("preferred_from", e.target.value)} />
            </Field>
            <Field label="Preferred to" htmlFor="pj-to">
              <Input id="pj-to" type="date" value={f.preferred_to} onChange={(e) => set("preferred_to", e.target.value)} />
            </Field>
            <Field label="Time of day" htmlFor="pj-time">
              <Input id="pj-time" value={f.preferred_time} onChange={(e) => set("preferred_time", e.target.value)} maxLength={120} placeholder="e.g. mornings" />
            </Field>
            <Field label="Budget from ($)" htmlFor="pj-bmin" hint="Optional">
              <Input id="pj-bmin" inputMode="decimal" value={f.budget_min} onChange={(e) => set("budget_min", e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="Budget to ($)" htmlFor="pj-bmax">
              <Input id="pj-bmax" inputMode="decimal" value={f.budget_max} onChange={(e) => set("budget_max", e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          </div>
          <Field label="Required verification" htmlFor="pj-badges">
            <div id="pj-badges" className="flex flex-wrap gap-4">
              {(["public_liability", "qualification"] as const).map((b) => (
                <label key={b} className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={f.required_badges.includes(b)}
                    onChange={(e) => set("required_badges", e.target.checked ? [...f.required_badges, b] : f.required_badges.filter((x) => x !== b))}
                    className="size-4 accent-[var(--brand)]"
                  />
                  {BADGE_LABELS[b]}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Site access and safety instructions" htmlFor="pj-site" hint="Private: shared only with the provider you engage">
            <Textarea id="pj-site" rows={3} value={f.site_access_notes} onChange={(e) => set("site_access_notes", e.target.value)} maxLength={2000} placeholder="e.g. Sign in at the gatehouse; hi-vis and steel caps" />
          </Field>
          <Field label="Attachments" htmlFor="pj-files" hint="PDF or photos. Untick 'Share' to keep a file private until engagement">
            <Input id="pj-files" type="file" multiple accept=".pdf,image/*" disabled={uploading || files.length >= 10} onChange={(e) => addFiles(e.target.files)} className="h-auto py-2" />
          </Field>
          {files.length ? (
            <ul className="flex flex-col gap-1.5">
              {files.map((x) => (
                <li key={x.path} className="flex items-center gap-3 text-[13.5px]">
                  <Paperclip className="size-4 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{x.file_name}</span>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={x.shared} onChange={(e) => setFiles((cur) => cur.map((y) => (y.path === x.path ? { ...y, shared: e.target.checked } : y)))} className="size-4 accent-[var(--brand)]" />
                    Share
                  </label>
                  <button type="button" aria-label={`Remove ${x.file_name}`} onClick={() => setFiles((cur) => cur.filter((y) => y.path !== x.path))}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={f.show_poster_name} onChange={(e) => set("show_poster_name", e.target.checked)} className="size-4 accent-[var(--brand)]" /> Show our name to providers
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={f.invited_only} onChange={(e) => set("invited_only", e.target.checked)} className="size-4 accent-[var(--brand)]" /> Invitation only (invite providers after posting)
            </label>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-ink-muted">This is exactly what providers will see. The address, site instructions and unshared files stay private until you confirm an engagement.</p>
          <div className="rounded-[12px] border border-stroke p-4">
            <p className="mb-3 text-[17px] font-semibold text-ink">{preview.title}</p>
            <JobSummary job={preview} />
          </div>
          <p className="rounded-[10px] border border-stroke bg-surface-muted p-3 text-[14px]">
            If you accept a proposal, the connection fee is <strong>{aud(preview.fee_cents)}</strong>
            {kind === "company" ? " (or covered by your monthly waiver, when you have one)" : ""}. The provider pays its own fee as well. Withdrawing the job costs nothing.
          </p>
        </div>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => (setError(null), setStep((s) => s - 1))}>
          <ArrowLeft /> Back
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            onClick={() => {
              const e = check(step);
              setError(e);
              if (!e) setStep((s) => s + 1);
            }}
          >
            Next <ArrowRight />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setError(null);
              setBusy(true);
              const res = await postJobAction(orgId, { ...f, work_order_id: prefill?.workOrderId, files });
              setBusy(false);
              if (res.status === "error") return setError(res.message);
              toast.success("Job posted. Matching providers have been alerted.");
              const id = res.status === "success" ? (res.data as string | undefined) : undefined;
              router.push(id ? `/customer/${orgId}/marketplace/${id}` : `/customer/${orgId}/marketplace`);
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null} Post job
          </Button>
        )}
      </div>
    </div>
  );
}
