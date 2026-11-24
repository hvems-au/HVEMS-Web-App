"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { saveEmailPreferencesAction } from "./actions";

const OPTIONS = [
  { key: "maintenance", label: "Maintenance and fleet", hint: "Minor defects, missed pre-starts, readings to review, parts approvals, expiring documents and licences." },
  { key: "marketplace", label: "Marketplace", hint: "Jobs, questions, proposals, engagements, cases and provider verification." },
] as const;

export function EmailPreferencesForm({ initial }: { initial: { maintenance: boolean; marketplace: boolean } }) {
  const [prefs, setPrefs] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const changed = prefs.maintenance !== initial.maintenance || prefs.marketplace !== initial.marketplace;

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveEmailPreferencesAction(prefs);
    setBusy(false);
    if (res.status === "success") toast.success(res.message);
    else if (res.status === "error") setError(res.message);
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold text-ink">Email me about</legend>
        <label className="flex items-start gap-3 rounded-[10px] border border-stroke p-3 text-[14px]">
          <input type="checkbox" checked disabled className="mt-1 size-4 accent-brand" aria-describedby="safety-hint" />
          <span>
            <span className="font-medium text-ink">Safety alerts and account security</span>
            <span id="safety-hint" className="block text-ink-subtle">
              Critical defects, out-of-service holds, breakdowns, escalations and support access. Always on.
            </span>
          </span>
        </label>
        {OPTIONS.map((o) => (
          <label key={o.key} className="flex items-start gap-3 rounded-[10px] border border-stroke p-3 text-[14px]">
            <input
              type="checkbox"
              name={o.key}
              checked={prefs[o.key]}
              onChange={(e) => setPrefs((p) => ({ ...p, [o.key]: e.target.checked }))}
              className="mt-1 size-4 accent-brand"
              aria-describedby={`${o.key}-hint`}
            />
            <span>
              <span className="font-medium text-ink">{o.label}</span>
              <span id={`${o.key}-hint`} className="block text-ink-subtle">
                {o.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-[13px] text-ink-subtle">In-app notifications are not affected.</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button onClick={save} disabled={busy || !changed} className="self-start">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Save preferences
      </Button>
    </div>
  );
}
