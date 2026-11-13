"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { formatAud } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addJobFileAction, removeJobFileAction } from "./actions";

export type JobDoc = {
  id: string;
  kind: "invoice" | "receipt" | "quote" | "photo" | "other";
  fileName: string;
  supplier: string | null;
  reference: string | null;
  amountCents: number | null;
  uploadedBy: string;
  uploadedAt: string;
  url: string | null;
  canRemove: boolean;
};

const KIND_LABEL: Record<JobDoc["kind"], string> = { invoice: "Invoice", receipt: "Receipt", quote: "Quote", photo: "Photo", other: "Other" };
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_BYTES = 15 * 1024 * 1024;

/** Invoices, receipts and quotes for a job: upload (PDF or photo), open, remove. */
export function JobDocuments({ orgId, woId, docs, canAdd }: { orgId: string; woId: string; docs: JobDoc[]; canAdd: boolean }) {
  const router = useRouter();
  const total = docs.filter((d) => d.kind === "invoice" || d.kind === "receipt").reduce((s, d) => s + (d.amountCents ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      {docs.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-stroke-strong px-4 py-5 text-center text-[13.5px] text-ink-muted">
          No documents yet. Add parts invoices and receipts after the job.
        </p>
      ) : (
        <ul className="divide-y divide-stroke rounded-[10px] border border-stroke">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-brand-soft text-brand-ink" aria-hidden>
                <FileText className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-medium text-link hover:underline">
                    {d.fileName}
                  </a>
                ) : (
                  <span className="block truncate text-[14px] font-medium text-ink">{d.fileName}</span>
                )}
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {[KIND_LABEL[d.kind], d.supplier, d.reference, d.amountCents !== null ? formatAud(d.amountCents) : null].filter(Boolean).join(" · ")}
                </span>
                <span className="block text-[12px] text-ink-subtle">
                  {d.uploadedBy} · {d.uploadedAt}
                </span>
              </span>
              {d.canRemove ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${d.fileName}`}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: `Remove ${d.fileName}?`, description: "It's kept in the audit history.", confirmLabel: "Remove", danger: true }))) return;
                    const res = await removeJobFileAction(orgId, woId, d.id);
                    if (res.status === "error") toast.error(res.message);
                    else toast.success("Document removed");
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {total ? <p className="text-right text-[13px] text-ink-muted">Invoices and receipts: <span className="font-semibold text-ink">{formatAud(total)}</span></p> : null}
      {canAdd ? <AddDocument orgId={orgId} woId={woId} /> : null}
    </div>
  );
}

function AddDocument({ orgId, woId }: { orgId: string; woId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<JobDoc["kind"]>("invoice");
  const [supplier, setSupplier] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const reset = () => {
    setFile(null);
    setKind("invoice");
    setSupplier("");
    setReference("");
    setAmount("");
    setError(null);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="self-start">
          <Upload /> Add invoice or document
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a document" description="PDF or a photo of the invoice, receipt or quote (up to 15 MB).">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!file) return setError("Choose a file.");
            if (file.size > MAX_BYTES) return setError("That file is larger than 15 MB.");
            setBusy(true);
            try {
              const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
              const path = `${orgId}/${woId}/${crypto.randomUUID()}-${safe}`;
              const up = await getSupabaseBrowserClient().storage.from("work-order-files").upload(path, file, { contentType: file.type, upsert: false });
              if (up.error) throw new Error("The file couldn't be uploaded. Check your connection and try again.");
              const res = await addJobFileAction(orgId, woId, { kind, path, fileName: file.name, supplier, reference, amount });
              if (res.status === "error") throw new Error(res.message);
              toast.success("Document added");
              setOpen(false);
              reset();
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="File" htmlFor="doc-file" required>
            <Input id="doc-file" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="doc-kind">
              <Select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as JobDoc["kind"])}>
                {(Object.keys(KIND_LABEL) as JobDoc["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount incl. GST (AUD)" htmlFor="doc-amount">
              <Input id="doc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 245.50" />
            </Field>
            <Field label="Supplier" htmlFor="doc-supplier">
              <Input id="doc-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={160} placeholder="e.g. Coates Parts" />
            </Field>
            <Field label="Invoice / reference no." htmlFor="doc-ref">
              <Input id="doc-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" /> Uploading…
                </>
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
