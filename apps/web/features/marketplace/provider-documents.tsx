"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, FileText, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addProviderDocumentAction, retireProviderDocumentAction, submitVerificationAction } from "./actions";
import { PROVIDER_CATEGORIES, dmy, type ProviderCategory } from "./labels";

export type ProviderDocRow = { id: string; kind: string; category: string | null; title: string; fileName: string; expiresOn: string | null; url: string | null };

const KIND_LABELS: Record<string, string> = { public_liability: "Public liability certificate", qualification: "Qualification", licence: "Licence", other: "Other" };

/** Verification documents: insurance, qualifications and licences. Uploading never creates a badge (MKT-02). */
export function ProviderDocuments({ orgId, docs, canEdit, today }: { orgId: string; docs: ProviderDocRow[]; canEdit: boolean; today: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      {docs.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-stroke-strong px-4 py-5 text-center text-[13.5px] text-ink-muted">
          No documents yet. Upload your current public liability certificate{canEdit ? "" : " (Provider Owner)"}.
        </p>
      ) : (
        <ul className="divide-y divide-stroke rounded-[10px] border border-stroke">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-brand-soft text-brand-ink" aria-hidden>
                <FileText className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-medium text-link hover:underline">
                    {d.title}
                  </a>
                ) : (
                  <span className="block truncate text-[14px] font-medium">{d.title}</span>
                )}
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {KIND_LABELS[d.kind] ?? d.kind}
                  {d.category ? ` · ${PROVIDER_CATEGORIES[d.category as ProviderCategory] ?? d.category}` : ""} · {d.fileName}
                </span>
              </span>
              {d.expiresOn ? <Badge tone={d.expiresOn < today ? "red" : "grey"}>{d.expiresOn < today ? "Expired" : "Expires"} {dmy(d.expiresOn)}</Badge> : null}
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${d.title}`}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: `Remove ${d.title}?`, description: "It stays in the history. Badges already granted stay until they expire.", confirmLabel: "Remove" })))
                      return;
                    const res = await retireProviderDocumentAction(orgId, d.id);
                    if (res.status === "error") toast.error(res.message);
                    router.refresh();
                  }}
                >
                  <Archive />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? <UploadDialog orgId={orgId} /> : null}
    </div>
  );
}

function UploadDialog({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState("public_liability");
  const [category, setCategory] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="self-start">
          <Upload /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent title="Upload a document" description="PDF or photo, up to 25 MB. HVEMS checks it before any badge is shown.">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!file) return setError("Choose a file.");
            if (file.size > 25 * 1024 * 1024) return setError("That file is larger than 25 MB.");
            setBusy(true);
            try {
              const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
              const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
              const up = await getSupabaseBrowserClient().storage.from("provider-documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
              if (up.error) throw new Error("The file couldn't be uploaded. Use a PDF or photo up to 25 MB.");
              const res = await addProviderDocumentAction(orgId, {
                kind,
                category: kind === "public_liability" ? undefined : category,
                title: title || file.name,
                path,
                fileName: file.name,
                contentType: file.type,
                sizeBytes: file.size,
                expiresOn,
              });
              if (res.status === "error") throw new Error(res.message);
              toast.success("Document uploaded");
              setOpen(false);
              setFile(null);
              setTitle("");
              setExpiresOn("");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="File" htmlFor="pd-file" required>
            <Input id="pd-file" type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="pd-kind">
              <Select id="pd-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expires on" htmlFor="pd-exp" required={kind === "public_liability"}>
              <Input id="pd-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </Field>
            {kind !== "public_liability" ? (
              <Field label="For which service" htmlFor="pd-cat">
                <Select id="pd-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Any</option>
                  {(Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {PROVIDER_CATEGORIES[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Title" htmlFor="pd-title" className={kind === "public_liability" ? "sm:col-span-2" : undefined}>
              <Input id="pd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Public liability 2026–27" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitVerificationButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await submitVerificationAction(orgId);
        setBusy(false);
        if (res.status === "error") toast.error(res.message);
        else toast.success("Sent to HVEMS for verification");
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Send />} Submit for verification
    </Button>
  );
}
