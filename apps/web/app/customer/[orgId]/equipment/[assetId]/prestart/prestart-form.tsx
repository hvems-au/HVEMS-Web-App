"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { INSPECTION_PHOTO_BUCKET, inspectionPhotoPath } from "@hvems/api-client";
import { DEFECT_SEVERITY_EFFECT, DEFECT_SEVERITY_LABELS } from "@hvems/domain";
import type { ChecklistItem, InspectionAnswerValue } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { submitPrestartAction } from "./actions";

type Answer = { answer?: InspectionAnswerValue; note: string };
type Photo = { key: string; itemCode: string | null; path?: string; preview: string; uploading: boolean; error?: string };

const MAX_PHOTOS = 10;
const SEVERITY_TONE = { critical: "red", minor: "amber", advisory: "grey" } as const;

/** Shrink large photos to at most 1600px JPEG before upload; falls back to the original file. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PrestartForm({
  orgId,
  assetId,
  checklist,
  tracksKm,
  tracksHours,
  lastKm,
  lastHours,
  doneBase,
}: {
  orgId: string;
  assetId: string;
  checklist: ChecklistItem[];
  tracksKm: boolean;
  tracksHours: boolean;
  lastKm: number | null;
  lastHours: number | null;
  /** Result page base path; the inspection id is appended (the driver portal has its own). */
  doneBase?: string;
}) {
  const router = useRouter();
  const [requestId] = React.useState(() => crypto.randomUUID());
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [odometer, setOdometer] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [declared, setDeclared] = React.useState(false);
  const [confirmJump, setConfirmJump] = React.useState(false);
  const [lowerReason, setLowerReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<{ code: string; message: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const sections = React.useMemo(() => {
    const out: { name: string; items: ChecklistItem[] }[] = [];
    for (const item of checklist) {
      const last = out[out.length - 1];
      if (last && last.name === item.template_name) last.items.push(item);
      else out.push({ name: item.template_name, items: [item] });
    }
    return out;
  }, [checklist]);

  const answered = checklist.filter((i) => answers[i.item_code]?.answer).length;
  const faults = checklist.filter((i) => answers[i.item_code]?.answer === "fault");
  const criticalFault = faults.some((i) => i.severity === "critical");

  const setAnswer = (code: string, answer: InspectionAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [code]: { note: prev[code]?.note ?? "", answer } }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`item:${code}`];
      return next;
    });
  };
  const setNote = (code: string, note: string) => setAnswers((prev) => ({ ...prev, [code]: { answer: prev[code]?.answer, note } }));
  const markRemainingOk = (items: ChecklistItem[]) =>
    setAnswers((prev) => {
      const next = { ...prev };
      for (const i of items) if (!next[i.item_code]?.answer) next[i.item_code] = { note: "", answer: "ok" };
      return next;
    });

  async function addPhotos(files: FileList | null, itemCode: string | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_PHOTOS} photos per pre-start`);
      return;
    }
    const db = getSupabaseBrowserClient();
    for (const file of Array.from(files).slice(0, room)) {
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { key, itemCode, preview, uploading: true }]);
      const body = await compress(file);
      const path = inspectionPhotoPath(orgId, assetId, requestId, body === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg");
      const { error } = await db.storage
        .from(INSPECTION_PHOTO_BUCKET)
        .upload(path, body, { contentType: body.type || file.type || "image/jpeg", upsert: false });
      setPhotos((prev) =>
        prev.map((p) => (p.key === key ? { ...p, uploading: false, path: error ? undefined : path, error: error ? "Upload failed" : undefined } : p)),
      );
      if (error) toast.error("A photo didn't upload. Check your connection and try again.");
    }
  }
  const removePhoto = (key: string) => setPhotos((prev) => prev.filter((p) => p.key !== key));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    // Quick checks here; the database repeats every one.
    const local: Record<string, string> = {};
    for (const i of checklist) {
      const a = answers[i.item_code];
      if (!a?.answer) local[`item:${i.item_code}`] = "Answer this item";
      else if (a.answer === "fault" && a.note.trim().length < 3) local[`item:${i.item_code}`] = "Describe the fault";
    }
    if (tracksKm && odometer.trim() === "") local.odometer_km = "Enter the odometer reading";
    if (tracksHours && hours.trim() === "") local.engine_hours = "Enter the hour meter reading";
    if (!declared) local.declaration = "Tick the declaration to submit";
    if (photos.some((p) => p.uploading)) local.photos = "Wait for the photos to finish uploading";
    setErrors(local);
    if (Object.keys(local).length) {
      const first = Object.keys(local)[0] ?? "";
      document.getElementById(first.startsWith("item:") ? first : `f-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    startTransition(async () => {
      const res = await submitPrestartAction(orgId, assetId, {
        answers: checklist.map((i) => ({
          item_code: i.item_code,
          answer: answers[i.item_code]!.answer!,
          note: answers[i.item_code]?.note.trim() || undefined,
        })),
        odometer_km: tracksKm ? Number(odometer) : null,
        engine_hours: tracksHours ? Number(hours) : null,
        notes: notes.trim() || undefined,
        photos: photos.filter((p) => p.path).map((p) => ({ path: p.path!, item_code: p.itemCode })),
        declaration: true,
        client_request_id: requestId,
        confirm_jump: confirmJump,
        lower_reading_reason: lowerReason.trim() || undefined,
      });
      if (res.status === "success" && res.data) {
        router.push(doneBase ? `${doneBase}/${res.data.inspection_id}?submitted=1` : `/customer/${orgId}/inspections/${res.data.inspection_id}?submitted=1`);
        return;
      }
      if (res.status === "error") {
        setErrors(res.fieldErrors ?? {});
        setFormError({ code: res.code, message: res.message });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const photoStrip = (itemCode: string | null) => {
    const list = photos.filter((p) => p.itemCode === itemCode);
    return (
      <div className="flex flex-wrap items-center gap-2">
        {list.map((p) => (
          <div key={p.key} className="relative size-16 overflow-hidden rounded-[8px] border border-stroke bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={p.preview} alt="" className={cn("size-full object-cover", p.uploading && "opacity-50")} />
            {p.uploading ? <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-ink" aria-label="Uploading" /> : null}
            {p.error ? <span className="absolute inset-x-0 bottom-0 bg-danger px-1 text-[10px] text-white">Failed</span> : null}
            <button
              type="button"
              onClick={() => removePhoto(p.key)}
              className="absolute right-0.5 top-0.5 rounded-full bg-surface/90 p-0.5 text-ink shadow"
              aria-label="Remove photo"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <label
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[6px] border border-stroke bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-muted",
            photos.length >= MAX_PHOTOS && "pointer-events-none opacity-50",
          )}
        >
          <Camera className="size-4" /> {itemCode ? "Add photo (recommended)" : "Add photos"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple={!itemCode}
            className="sr-only"
            onChange={(e) => {
              void addPhotos(e.target.files, itemCode);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {formError ? (
        <FormAlert>
          {formError.message}
          {formError.code === "implausible_jump_confirmation_required" ? (
            <label className="mt-2 flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={confirmJump} onChange={(e) => setConfirmJump(e.target.checked)} className="size-4 accent-[var(--brand)]" />
              The reading is correct
            </label>
          ) : null}
          {formError.code === "lower_reading_reason_required" ? (
            <Input className="mt-2" value={lowerReason} onChange={(e) => setLowerReason(e.target.value)} placeholder="Why is it lower? e.g. odometer or hour meter replaced" />
          ) : null}
        </FormAlert>
      ) : null}

      {tracksKm || tracksHours ? (
        <Card>
          <CardHeader title={tracksKm && tracksHours ? "Odometer and hour meter" : tracksKm ? "Odometer reading" : "Hour meter reading"} description="Read it from the dash now" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {tracksKm ? (
              <Field label="Odometer (km)" htmlFor="f-odometer_km" error={errors.odometer_km} hint={lastKm !== null ? `Last: ${lastKm.toLocaleString("en-AU")} km` : undefined} required>
                <Input inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 125400" />
              </Field>
            ) : null}
            {tracksHours ? (
              <Field label="Hour meter (hours)" htmlFor="f-engine_hours" error={errors.engine_hours} hint={lastHours !== null ? `Last: ${lastHours.toLocaleString("en-AU")} hours` : undefined} required>
                <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 5230.5" />
              </Field>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {sections.map((section) => (
        <Card key={section.name}>
          <CardHeader
            title={section.name}
            description={`${section.items.filter((i) => answers[i.item_code]?.answer).length} of ${section.items.length} answered`}
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => markRemainingOk(section.items.filter((i) => !i.operator_item))}>
                <CheckCheck /> Mark rest OK
              </Button>
            }
          />
          <CardBody className="flex flex-col divide-y divide-stroke px-0 pb-0">
            {section.items.map((item) => {
              const a = answers[item.item_code];
              const err = errors[`item:${item.item_code}`];
              return (
                <div key={item.item_code} id={`item:${item.item_code}`} className={cn("px-5 py-3.5", err && "bg-danger-soft/40")}>
                  <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-medium text-ink">
                        <span className="mr-1.5 text-[12px] font-semibold text-ink-subtle">{item.item_code}</span>
                        {item.prompt}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.operator_item ? <Badge tone="blue">About you</Badge> : null}
                        <Badge tone={SEVERITY_TONE[item.severity]} title={DEFECT_SEVERITY_EFFECT[item.severity]}>
                          If faulty: {DEFECT_SEVERITY_LABELS[item.severity]}
                        </Badge>
                      </div>
                    </div>
                    <div role="radiogroup" aria-label={item.prompt} className="grid shrink-0 grid-cols-3 gap-2 md:flex md:gap-1.5">
                      {(
                        [
                          ["ok", item.operator_item ? "Yes" : "OK", "border-ok bg-ok-soft text-ok-ink"],
                          ["fault", item.operator_item ? "No" : "Fault", "border-danger bg-danger-soft text-danger-ink"],
                          ["na", "N/A", "border-ink-subtle bg-surface-muted text-ink"],
                        ] as const
                      ).map(([value, label, on]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={a?.answer === value}
                          disabled={value === "na" && !item.na_allowed}
                          onClick={() => setAnswer(item.item_code, value)}
                          className={cn(
                            "h-11 min-w-16 rounded-[8px] border-2 px-3 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 md:h-10",
                            a?.answer === value ? on : "border-stroke-strong bg-surface text-ink hover:border-ink-subtle",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {a?.answer === "fault" ? (
                    <div className="mt-3 flex flex-col gap-2.5">
                      <Textarea
                        rows={2}
                        value={a.note}
                        onChange={(e) => setNote(item.item_code, e.target.value)}
                        placeholder={item.operator_item ? "Tell your supervisor what's wrong" : "Describe the fault: what, where, how bad"}
                        aria-label={`Note for ${item.item_code}`}
                      />
                      {item.operator_item ? null : photoStrip(item.item_code)}
                    </div>
                  ) : null}
                  {err ? (
                    <p className="mt-1.5 text-[13px] text-danger" role="alert">
                      {err}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title="Notes and photos" description="Anything else the workshop or your supervisor should know" />
        <CardBody className="flex flex-col gap-3">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" aria-label="General notes" />
          {photoStrip(null)}
          {errors.photos ? <p className="text-[13px] text-danger">{errors.photos}</p> : null}
        </CardBody>
      </Card>

      <Card id="f-declaration">
        <CardBody className="flex flex-col gap-4">
          {criticalFault ? (
            <FormAlert>A critical fault will take this equipment out of service. Don&apos;t operate it until it has been repaired and cleared.</FormAlert>
          ) : null}
          <label className="flex items-start gap-3 text-[14.5px] text-ink">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand)]" />
            <span>
              I have completed this check honestly. Faults I found are recorded above.
              <span className="block text-[12.5px] text-ink-subtle">Submitting signs the pre-start with your name, the date and time.</span>
            </span>
          </label>
          {errors.declaration ? <p className="text-[13px] text-danger">{errors.declaration}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink-muted">
              {answered} of {checklist.length} answered{faults.length ? ` · ${faults.length} fault${faults.length === 1 ? "" : "s"}` : ""}
            </p>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Submitting…" : "Submit pre-start"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Progress stays in view while scrolling through the checks. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-stroke bg-surface/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-[12px] sm:border">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink" aria-live="polite">
            <span className="font-semibold">
              {answered} of {checklist.length}
            </span>{" "}
            answered
            {faults.length ? <span className="text-danger-ink"> · {faults.length} fault{faults.length === 1 ? "" : "s"}</span> : null}
          </p>
          {answered < checklist.length ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const next = checklist.find((i) => !answers[i.item_code]?.answer);
                if (next) document.getElementById(`item:${next.item_code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Next unanswered
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => document.getElementById("f-declaration")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              Review and submit
            </Button>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Checks answered" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={answered}>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${checklist.length ? (answered / checklist.length) * 100 : 0}%` }} />
        </div>
      </div>
    </form>
  );
}
