"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, FileText, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addDocumentAction, supersedeDocumentAction } from "./actions";

import { DOCUMENT_CATEGORIES, type DocCategory } from "./categories";

export type DocRow = {
  id: string;
  category: DocCategory;
  title: string;
  fileName: string;
  expiresOn: string | null;
  expiry: "expired" | "soon" | "ok" | null;
  uploadedBy: string;
  uploadedAt: string;
  url: string | null;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt,.csv";
const MAX = 25 * 1024 * 1024;
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** An equipment's documents: open (5-minute link), upload, replace or retire with a reason. */
export function EquipmentDocuments({ orgId, assetId, docs, canManage }: { orgId: string; assetId: string; docs: DocRow[]; canManage: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      {docs.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-stroke-strong px-4 py-5 text-center text-[13.5px] text-ink-muted">
          No documents yet{canManage ? ". Add registration, insurance, manuals and certificates, with expiry dates for reminders." : "."}
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
                  <span className="block truncate text-[14px] font-medium text-ink">{d.title}</span>
                )}
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {DOCUMENT_CATEGORIES[d.category]} · {d.fileName} · {d.uploadedBy}, {d.uploadedAt}
                </span>
              </span>
              {d.expiresOn ? (
                <Badge tone={d.expiry === "expired" ? "red" : d.expiry === "soon" ? "amber" : "grey"}>
                  {d.expiry === "expired" ? "Expired" : "Expires"} {dmy(d.expiresOn)}
                </Badge>
              ) : null}
              {canManage ? (
                <span className="flex gap-1">
                  <DocumentDialog orgId={orgId} assetId={assetId} replace={{ id: d.id, title: d.title, category: d.category }} />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Retire ${d.title}`}
                    onClick={async () => {
                      const reason = await promptDialog({
                        title: `Retire ${d.title}?`,
                        description: "It stays in the history but no longer shows as current. Documents are never deleted.",
                        input: { label: "Reason", required: true },
                        confirmLabel: "Retire",
                      });
                      if (!reason) return;
                      const res = await supersedeDocumentAction(orgId, d.id, reason);
                      if (res.status === "error") toast.error(res.message);
                      else toast.success("Document retired");
                      router.refresh();
                    }}
                  >
                    <Archive />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? <DocumentDialog orgId={orgId} assetId={assetId} /> : null}
    </div>
  );
}

function DocumentDialog({ orgId, assetId, replace }: { orgId: string; assetId: string; replace?: { id: string; title: string; category: DocCategory } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [category, setCategory] = React.useState<DocCategory>(replace?.category ?? "registration");
  const [title, setTitle] = React.useState(replace?.title ?? "");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState(replace ? "Renewed" : "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        {replace ? (
          <Button size="sm" variant="ghost" aria-label={`Replace ${replace.title}`}>
            <RefreshCw />
          </Button>
        ) : (
          <Button variant="secondary" className="self-start">
            <Upload /> Add document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={replace ? `Replace ${replace.title}` : "Add a document"}
        description={replace ? "The old version is kept in the history." : "PDF, photo, Word or Excel, up to 25 MB. Add an expiry date for reminders 30 and 7 days before."}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!file) return setError("Choose a file.");
            if (file.size > MAX) return setError("That file is larger than 25 MB.");
            setBusy(true);
            try {
              const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
              const path = `${orgId}/${assetId}/${crypto.randomUUID()}-${safe}`;
              const up = await getSupabaseBrowserClient().storage.from("documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
              if (up.error) throw new Error("The file couldn't be uploaded. Check its type and size, and your connection.");
              const res = await addDocumentAction(orgId, {
                assetId,
                category,
                title: title || file.name,
                path,
                fileName: file.name,
                contentType: file.type || undefined,
                sizeBytes: file.size,
                expiresOn,
                notes,
                replaces: replace?.id ?? "",
                replaceReason: replace ? reason : undefined,
              });
              if (res.status === "error") throw new Error(res.message);
              toast.success(replace ? "Document replaced" : "Document added");
              setOpen(false);
              setFile(null);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="File" htmlFor="doc-file-input" required>
            <Input id="doc-file-input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="doc-cat">
              <Select id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
                {(Object.keys(DOCUMENT_CATEGORIES) as DocCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_CATEGORIES[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expires on" htmlFor="doc-exp" hint="Optional; reminders at 30 and 7 days">
              <Input id="doc-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </Field>
            <Field label="Title" htmlFor="doc-title" className="sm:col-span-2" hint="e.g. CTP insurance 2026–27">
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </Field>
          </div>
          {replace ? (
            <Field label="Why is it being replaced?" htmlFor="doc-reason" required>
              <Input id="doc-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </Field>
          ) : (
            <Field label="Notes" htmlFor="doc-notes">
              <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" /> Uploading…
                </>
              ) : replace ? (
                "Replace"
              ) : (
                "Add document"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
