"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { ISSUE_CATEGORIES, type IssueCategory } from "@hvems/domain";
import { cn } from "@/lib/utils";
import { ISSUE_CATEGORY_ICON } from "./issue-category";
import { reportIssueAction } from "./actions";

type Urgency = "stop" | "soon" | "not_urgent";
const URGENCY: { value: Urgency; title: string; help: string; tone: string }[] = [
  { value: "stop", title: "No: it's unsafe, stop using it", help: "It goes out of service and managers are alerted straight away.", tone: "border-danger bg-danger-soft text-danger-ink" },
  { value: "soon", title: "Yes, but it needs attention soon", help: "Managers are told and will review it.", tone: "border-warn-line bg-warn-soft text-warn-ink" },
  { value: "not_urgent", title: "Yes, it's not urgent", help: "Recorded for the next service or check.", tone: "border-stroke-strong bg-surface-muted text-ink" },
];

/** Report an issue: a few words, optional detail and photos, and whether it's safe to keep using. */
export function IssueForm({ orgId, assetId, doneBase }: { orgId: string; assetId: string; doneBase: string }) {
  const router = useRouter();
  // One id per report: a retry after a network error never creates a second record.
  const [requestId] = React.useState(() => crypto.randomUUID());
  const [category, setCategory] = React.useState<IssueCategory | null>(null);
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [urgency, setUrgency] = React.useState<Urgency | null>(null);
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const onPhotos = React.useCallback((paths: string[]) => setEvidence(paths), []);
  const onBusy = React.useCallback((b: boolean) => setUploading(b), []);

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!category) return setError("Choose what kind of issue it is.");
        if (!urgency) return setError("Say whether it is safe to keep using.");
        start(async () => {
          const res = await reportIssueAction(orgId, assetId, { category, summary, description, urgency, evidence, requestId });
          if (res.status === "error") return setError(res.message);
          if (res.status === "success" && res.data) router.push(`${doneBase}/${res.data.id}?submitted=1`);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium text-ink">
          What kind of issue is it? <span className="text-danger">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What kind of issue is it?">
          {ISSUE_CATEGORIES.map((c) => {
            const Icon = ISSUE_CATEGORY_ICON[c.value]!;
            const on = category === c.value;
            const urgent = c.value === "breakdown";
            return (
              <label
                key={c.value}
                title={c.help}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[10px] border-2 px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  on ? (urgent ? "border-danger bg-danger-soft text-danger-ink" : "border-brand bg-brand-soft text-ink") : "border-stroke bg-surface text-ink hover:border-stroke-strong hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  checked={on}
                  onChange={() => {
                    setCategory(c.value);
                    // A breakdown usually means it can't be used; suggest that (they can change it).
                    if (urgent && !urgency) setUrgency("stop");
                  }}
                  className="sr-only"
                />
                <span className="flex items-center gap-2 text-[14.5px] font-semibold">
                  <Icon className={cn("size-[18px] shrink-0", on ? (urgent ? "text-danger-ink" : "text-brand-ink") : urgent ? "text-danger" : "text-ink-muted")} aria-hidden />
                  {c.label}
                </span>
                <span className="text-[12px] leading-snug text-ink-muted">{c.help}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Describe the problem" htmlFor="issue-summary" required hint="A short line, e.g. Front left tyre losing air">
        <Input id="issue-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} autoComplete="off" className="h-12 text-[16px]" />
      </Field>
      <Field label="More detail" htmlFor="issue-detail" hint={urgency === "stop" ? "Required: describe what is unsafe" : "Optional: where it is, when it started, how bad"}>
        <Textarea id="issue-detail" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="text-[16px]" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium text-ink">
          Is it safe to keep using it? <span className="text-danger">*</span>
        </legend>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Is it safe to keep using it?">
          {URGENCY.map((u) => (
            <label
              key={u.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[10px] border-2 px-4 py-3",
                urgency === u.value ? u.tone : "border-stroke bg-surface text-ink hover:border-stroke-strong",
              )}
            >
              <input type="radio" name="urgency" value={u.value} checked={urgency === u.value} onChange={() => setUrgency(u.value)} className="mt-1 size-4 accent-[var(--brand)]" />
              <span>
                <span className="block text-[15px] font-semibold">{u.title}</span>
                <span className="block text-[13px] opacity-90">{u.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="mb-2 text-[14px] font-medium text-ink">Photos</p>
        <PhotoPicker orgId={orgId} assetId={assetId} folder={`reports/${requestId}`} onChange={onPhotos} onBusyChange={onBusy} label="Add photo" />
      </div>
      <Button type="submit" size="lg" className="h-12 text-[16px]" disabled={pending || uploading}>
        {pending ? "Sending…" : uploading ? "Waiting for photos…" : "Send report"}
      </Button>
    </form>
  );
}
