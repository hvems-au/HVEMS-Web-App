"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { IdCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CREDENTIAL_KINDS, CREDENTIAL_LABEL_HINTS, CREDENTIAL_LABELS, credentialTitle, type CredentialKind, type CredentialStatus } from "@hvems/domain";
import type { DriverCredential } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { deleteDriverCredentialAction, saveDriverCredentialAction } from "./actions";

export type CredentialRow = DriverCredential & { status: CredentialStatus; expiresText: string | null };

const STATUS_BADGE: Record<CredentialStatus, { tone: "red" | "amber" | "green" | "grey"; text: (d: string | null) => string }> = {
  expired: { tone: "red", text: (d) => `Expired ${d}` },
  expiring: { tone: "amber", text: (d) => `Expires ${d}` },
  current: { tone: "green", text: (d) => `Expires ${d}` },
  no_expiry: { tone: "grey", text: () => "No expiry" },
};

type Draft = { id?: string; kind: CredentialKind; label: string; number: string; issued_by: string; expires_on: string };
const EMPTY: Draft = { kind: "driver_licence", label: "", number: "", issued_by: "", expires_on: "" };

/** Licence, plant ticket, induction card and track safety numbers with expiry dates (2B). */
export function CredentialsDialog({ orgId, driverId, name, credentials }: { orgId: string; driverId: string; name: string; credentials: CredentialRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = () =>
    start(async () => {
      if (!draft) return;
      setError(null);
      const res = await saveDriverCredentialAction(orgId, driverId, { ...draft, id: draft.id || undefined });
      if (res.status === "error") return setError(res.message);
      toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
      setDraft(null);
      router.refresh();
    });

  const remove = (c: CredentialRow) => {
    if (!window.confirm(`Remove ${credentialTitle(c)} (${c.number}) from ${name}?`)) return;
    start(async () => {
      const res = await deleteDriverCredentialAction(orgId, c.id);
      if (res.status === "error") toast.error(res.message);
      else toast.success("Credential removed");
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setDraft(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <IdCard /> Credentials
        </Button>
      </DialogTrigger>
      <DialogContent title={`Credentials · ${name}`} description="Licence, plant ticket, induction and track safety numbers. The Owner and Fleet Managers are warned 30 days before one expires.">
        {draft ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field label="Type" htmlFor="cred-kind" required>
              <Select id="cred-kind" value={draft.kind} onChange={(e) => set("kind", e.target.value)}>
                {CREDENTIAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CREDENTIAL_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={CREDENTIAL_LABEL_HINTS[draft.kind]} htmlFor="cred-label" required={draft.kind === "other"}>
              <Input id="cred-label" value={draft.label} maxLength={80} onChange={(e) => set("label", e.target.value)} />
            </Field>
            <Field label="Number" htmlFor="cred-number" required>
              <Input id="cred-number" value={draft.number} maxLength={60} autoComplete="off" onChange={(e) => set("number", e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Issued by" htmlFor="cred-issuer" hint="e.g. QLD TMR, WorkSafe QLD">
                <Input id="cred-issuer" value={draft.issued_by} maxLength={80} onChange={(e) => set("issued_by", e.target.value)} />
              </Field>
              <Field label="Expiry date" htmlFor="cred-expiry" hint="Leave empty if it doesn't expire">
                <Input id="cred-expiry" type="date" value={draft.expires_on} onChange={(e) => set("expires_on", e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save credential"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {credentials.length === 0 ? (
              <p className="rounded-[8px] bg-surface-muted p-4 text-center text-[13.5px] text-ink-muted">No credentials recorded yet.</p>
            ) : (
              <ul className="divide-y divide-stroke rounded-[10px] border border-stroke">
                {credentials.map((c) => {
                  const b = STATUS_BADGE[c.status];
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-ink">{credentialTitle(c)}</p>
                        <p className="font-mono text-[12.5px] text-ink-muted">
                          {c.number}
                          {c.issued_by ? <span className="font-sans"> · {c.issued_by}</span> : null}
                        </p>
                      </div>
                      <Badge tone={b.tone}>{b.text(c.expiresText)}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${credentialTitle(c)}`}
                        onClick={() =>
                          setDraft({ id: c.id, kind: c.kind, label: c.label ?? "", number: c.number, issued_by: c.issued_by ?? "", expires_on: c.expires_on ?? "" })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${credentialTitle(c)}`} disabled={pending} onClick={() => remove(c)}>
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setDraft({ ...EMPTY })}>
                <Plus /> Add credential
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
