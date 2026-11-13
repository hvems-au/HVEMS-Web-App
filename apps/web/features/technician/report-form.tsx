"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, History } from "lucide-react";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { submitPostAndCompleteAction, submitPreReportAction } from "./actions";
import { POST_CHECKS, PRE_CHECKS } from "./checks";

type Answer = "ok" | "issue" | "na";

const ANSWERS: { value: Answer; label: string; on: string }[] = [
  { value: "ok", label: "OK", on: "border-ok bg-ok-soft text-ok-ink" },
  { value: "issue", label: "Issue", on: "border-danger bg-danger-soft text-danger-ink" },
  { value: "na", label: "N/A", on: "border-stroke-strong bg-surface-muted text-ink" },
];

export type DuePrefill = {
  /** Next due now (from the plan) and a suggestion from its interval. */
  currentOn: string | null;
  currentKm: number | null;
  currentHours: number | null;
  suggestOn: string | null;
  suggestKm: number | null;
  suggestHours: number | null;
  tracksDays: boolean;
  tracksKm: boolean;
  tracksHours: boolean;
  history: { when: string; who: string; text: string }[];
};

const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * Pre-work or post-work report. Pre: condition on arrival (filing it starts the
 * job). Post: what was done, labour and cost, and the next service due; filing
 * it completes the job for a manager to review.
 */
export function JobReportForm({
  orgId,
  woId,
  assetId,
  kind,
  meters,
  initial,
  due,
  completeLabel,
}: {
  orgId: string;
  woId: string;
  assetId: string;
  kind: "pre" | "post";
  meters: { km: boolean; hours: boolean };
  initial?: { notes: string; checks: Record<string, Answer>; odometer_km: number | null; engine_hours: number | null } | null;
  due?: DuePrefill | null;
  completeLabel?: string;
}) {
  const router = useRouter();
  const checks = kind === "pre" ? PRE_CHECKS : POST_CHECKS;
  const [answers, setAnswers] = React.useState<Record<string, Answer>>(initial?.checks ?? {});
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [km, setKm] = React.useState(initial?.odometer_km?.toString() ?? "");
  const [hours, setHours] = React.useState(initial?.engine_hours?.toString() ?? "");
  const [labour, setLabour] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [nextOn, setNextOn] = React.useState(due?.suggestOn ?? "");
  const [nextKm, setNextKm] = React.useState(due?.suggestKm?.toString() ?? "");
  const [nextHours, setNextHours] = React.useState(due?.suggestHours?.toString() ?? "");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const onPhotos = React.useCallback((p: string[]) => setPhotos(p), []);
  const onBusy = React.useCallback((b: boolean) => setUploading(b), []);
  const answered = checks.filter((c) => answers[c.id]).length;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (answered < checks.length) return setError("Answer every check (OK, Issue or N/A).");
        if (notes.trim().length < 3) return setError(kind === "pre" ? "Describe the condition before work." : "Describe the work done.");
        start(async () => {
          const base = { notes, checks: answers, photos, odometer_km: km, engine_hours: hours };
          const res =
            kind === "pre"
              ? await submitPreReportAction(orgId, woId, base)
              : await submitPostAndCompleteAction(orgId, woId, {
                  ...base,
                  labour_hours: labour,
                  cost,
                  next_due_on: due?.tracksDays ? nextOn : undefined,
                  next_due_km: due?.tracksKm ? nextKm : undefined,
                  next_due_hours: due?.tracksHours ? nextHours : undefined,
                });
          if (res.status === "error") return setError(res.message);
          toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
          router.refresh();
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-[14px] font-semibold text-ink">
          Checks
          <span className="text-[12.5px] font-medium text-ink-muted">
            {answered} of {checks.length}
          </span>
        </legend>
        <ul className="divide-y divide-stroke rounded-[12px] border border-stroke">
          {checks.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[14px] text-ink">{c.label}</span>
              <span role="radiogroup" aria-label={c.label} className="grid shrink-0 grid-cols-3 gap-1.5 sm:flex">
                {ANSWERS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={answers[c.id] === a.value}
                    onClick={() => setAnswers((x) => ({ ...x, [c.id]: a.value }))}
                    className={cn(
                      "h-10 min-w-16 rounded-[8px] border px-3 text-[13.5px] font-semibold transition-colors",
                      answers[c.id] === a.value ? a.on : "border-stroke bg-surface text-ink-muted hover:border-stroke-strong hover:text-ink",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </fieldset>

      <Field
        label={kind === "pre" ? "Condition before work" : "Work done"}
        htmlFor={`${kind}-notes`}
        required
        hint={kind === "pre" ? "What you found: damage, leaks, warning lights, anything unusual" : "What you did, parts fitted, anything still to watch"}
      >
        <Textarea id={`${kind}-notes`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
      </Field>

      {meters.km || meters.hours || kind === "post" ? (
        <div className="grid grid-cols-2 gap-3">
          {meters.km ? (
            <Field label="Odometer (km)" htmlFor={`${kind}-km`}>
              <Input id={`${kind}-km`} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          ) : null}
          {meters.hours ? (
            <Field label="Hour meter (hours)" htmlFor={`${kind}-hours`}>
              <Input id={`${kind}-hours`} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          ) : null}
          {kind === "post" ? (
            <>
              <Field label="Labour (hours)" htmlFor="post-labour">
                <Input id="post-labour" inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
              <Field label="Parts and costs (AUD)" htmlFor="post-cost" hint="Add the invoices under Documents">
                <Input id="post-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 480.00" />
              </Field>
            </>
          ) : null}
        </div>
      ) : null}

      {kind === "post" && due && (due.tracksDays || due.tracksKm || due.tracksHours) ? (
        <section className="rounded-[12px] border border-brand/40 bg-brand-soft/50 p-4">
          <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            <CalendarClock className="size-[18px] text-brand-ink" aria-hidden /> Next service due
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Suggested from the service interval. Change it if the equipment needs it sooner. It applies when a manager closes the job.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {due.tracksDays ? (
              <Field label="Date" htmlFor="next-on" hint={`Was ${dmy(due.currentOn)}`}>
                <Input id="next-on" type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} />
              </Field>
            ) : null}
            {due.tracksKm ? (
              <Field label="At odometer (km)" htmlFor="next-km" hint={`Was ${due.currentKm?.toLocaleString("en-AU") ?? "—"} km`}>
                <Input id="next-km" inputMode="decimal" value={nextKm} onChange={(e) => setNextKm(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
            ) : null}
            {due.tracksHours ? (
              <Field label="At hour meter (hours)" htmlFor="next-hours" hint={`Was ${due.currentHours?.toLocaleString("en-AU") ?? "—"} h`}>
                <Input id="next-hours" inputMode="decimal" value={nextHours} onChange={(e) => setNextHours(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
            ) : null}
          </div>
          {due.history.length ? (
            <details className="mt-3 text-[13px]">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-link [&::-webkit-details-marker]:hidden">
                <History className="size-4" aria-hidden /> Previously chosen ({due.history.length})
              </summary>
              <ul className="mt-2 divide-y divide-stroke rounded-[8px] border border-stroke bg-surface">
                {due.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="font-medium text-ink">{h.text}</span>
                    <span className="text-ink-subtle">
                      {h.who} · {h.when}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <div>
        <p className="mb-2 text-[14px] font-medium text-ink">Photos</p>
        <PhotoPicker orgId={orgId} assetId={assetId} folder={`jobs/${woId}/${kind}`} onChange={onPhotos} onBusyChange={onBusy} max={6} label="Add photo" />
      </div>

      <Button type="submit" size="lg" className="h-12 text-[15px]" disabled={pending || uploading}>
        {pending ? "Saving…" : uploading ? "Waiting for photos…" : (completeLabel ?? (kind === "pre" ? "Save and start job" : "Complete job"))}
      </Button>
    </form>
  );
}
