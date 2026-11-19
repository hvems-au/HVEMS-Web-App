"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import type { MarketplaceRegion, ProviderProfile } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { saveProviderProfileAction } from "./actions";
import { PROVIDER_CATEGORIES, dmy, type ProviderCategory } from "./labels";

function Chips<T extends string>({ id, options, value, onChange, label }: { id: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              on ? "border-brand bg-brand-soft text-brand-ink" : "border-stroke-strong bg-surface text-ink-muted hover:bg-surface-hover",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The provider's profile (MKT-01): what it does, where, and when. Contacts stay private until an engagement. */
export function ProviderProfileForm({ orgId, profile, regions, canEdit }: { orgId: string; profile: ProviderProfile | null; regions: MarketplaceRegion[]; canEdit: boolean }) {
  const router = useRouter();
  const [p, setP] = React.useState({
    description: profile?.description ?? "",
    contact_name: profile?.contact_name ?? "",
    contact_phone: profile?.contact_phone ?? "",
    contact_email: profile?.contact_email ?? "",
    categories: (profile?.categories ?? []) as ProviderCategory[],
    region_codes: profile?.region_codes ?? [],
    base_suburb: profile?.base_suburb ?? "",
    base_postcode: profile?.base_postcode ?? "",
    radius_km: profile?.radius_km ? String(profile.radius_km) : "",
    mobile_service: profile?.mobile_service ?? false,
    workshop_address: profile?.workshop_address ?? "",
    hours: profile?.hours ?? "",
    accepting_urgent: profile?.accepting_urgent ?? false,
    unavailable_dates: profile?.unavailable_dates ?? [],
  });
  const [newDate, setNewDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((cur) => ({ ...cur, [k]: v }));

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const res = await saveProviderProfileAction(orgId, p);
        setBusy(false);
        if (res.status === "error") return setError(res.message);
        toast.success("Profile saved");
        router.refresh();
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <Field label="Services you offer" htmlFor="pp-cats" required hint="At least one, to be verified">
          <Chips
            id="pp-cats"
            label="Services"
            options={(Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => ({ value: k, label: PROVIDER_CATEGORIES[k] }))}
            value={p.categories}
            onChange={(v) => set("categories", v)}
          />
        </Field>
        <Field label="Regions you cover" htmlFor="pp-regions" required hint="Or give a base suburb and radius below">
          <Chips id="pp-regions" label="Regions" options={regions.map((r) => ({ value: r.code, label: r.name + (r.open ? "" : " (not open yet)") }))} value={p.region_codes} onChange={(v) => set("region_codes", v)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Base suburb" htmlFor="pp-suburb">
            <Input id="pp-suburb" value={p.base_suburb} onChange={(e) => set("base_suburb", e.target.value)} maxLength={80} placeholder="e.g. Strathpine" />
          </Field>
          <Field label="Postcode" htmlFor="pp-postcode">
            <Input id="pp-postcode" inputMode="numeric" value={p.base_postcode} onChange={(e) => set("base_postcode", e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          <Field label="Radius (km)" htmlFor="pp-radius">
            <Input id="pp-radius" inputMode="numeric" value={p.radius_km} onChange={(e) => set("radius_km", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 80" />
          </Field>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={p.mobile_service} onChange={(e) => set("mobile_service", e.target.checked)} className="size-4 accent-[var(--brand)]" /> We offer mobile (on-site) service
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={p.accepting_urgent} onChange={(e) => set("accepting_urgent", e.target.checked)} className="size-4 accent-[var(--brand)]" /> Accepting urgent jobs
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Workshop address" htmlFor="pp-workshop">
            <Input id="pp-workshop" value={p.workshop_address} onChange={(e) => set("workshop_address", e.target.value)} maxLength={300} />
          </Field>
          <Field label="Opening hours" htmlFor="pp-hours">
            <Input id="pp-hours" value={p.hours} onChange={(e) => set("hours", e.target.value)} maxLength={500} placeholder="e.g. Mon–Fri 7am–5pm, Sat 7am–12pm" />
          </Field>
        </div>
        <Field label="About your business" htmlFor="pp-desc" hint="Shown to job posters">
          <Textarea id="pp-desc" rows={3} value={p.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Unavailable dates" htmlFor="pp-unavail" hint="You won't be alerted to new jobs on these days">
          <div className="flex flex-wrap items-center gap-2">
            {p.unavailable_dates.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full border border-stroke-strong px-2.5 py-1 text-[13px]">
                {dmy(d)}
                <button type="button" aria-label={`Remove ${dmy(d)}`} onClick={() => set("unavailable_dates", p.unavailable_dates.filter((x) => x !== d))}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <Input id="pp-unavail" type="date" aria-label="Add an unavailable date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!newDate}
              onClick={() => {
                if (!p.unavailable_dates.includes(newDate)) set("unavailable_dates", [...p.unavailable_dates, newDate].sort());
                setNewDate("");
              }}
            >
              <Plus /> Add
            </Button>
          </div>
        </Field>
        <div className="rounded-[10px] border border-stroke p-4">
          <p className="mb-3 text-[13px] text-ink-muted">Private contact details: shared only with a customer once an engagement is confirmed.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Contact name" htmlFor="pp-cn">
              <Input id="pp-cn" value={p.contact_name} onChange={(e) => set("contact_name", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Phone" htmlFor="pp-cp">
              <Input id="pp-cp" type="tel" value={p.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} maxLength={40} />
            </Field>
            <Field label="Email" htmlFor="pp-ce">
              <Input id="pp-ce" type="email" value={p.contact_email} onChange={(e) => set("contact_email", e.target.value)} maxLength={254} />
            </Field>
          </div>
        </div>
      </fieldset>
      {canEdit ? (
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? <Loader2 className="animate-spin" /> : null} Save profile
        </Button>
      ) : null}
    </form>
  );
}
