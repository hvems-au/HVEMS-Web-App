"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { WorkforceProfile, WorkforceQualification } from "@hvems/api-client";
import { LEAVE_KINDS, LEAVE_LABELS, QUALIFICATION_KINDS, QUALIFICATION_LABEL_HINTS, QUALIFICATION_LABELS, type QualificationKind } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { addLeaveAction, cancelLeaveAction, deleteQualificationAction, saveProfileAction, saveQualificationAction } from "./actions";
import { confirmDialog } from "@/components/ui/confirm";

/** Runs a server action, shows the result and refreshes the page. */
function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, done?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === "error") return setError(res.message);
      toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
      done?.();
      router.refresh();
    });
  return { pending, error, setError, run };
}

/** Trade, phone, notes and "available for work orders". */
export function ProfileDialog({ orgId, userId, name, profile }: { orgId: string; userId: string; name: string; profile: WorkforceProfile | null }) {
  const [open, setOpen] = React.useState(false);
  const { pending, error, setError, run } = useRun();
  const initial = { trade: profile?.trade ?? "", phone: profile?.phone ?? "", notes: profile?.notes ?? "", available: profile?.available ?? true };
  const [v, setV] = React.useState(initial);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? setV(initial) : setError(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil /> Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent title={`Profile · ${name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveProfileAction(orgId, userId, v), () => setOpen(false));
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Trade" htmlFor="wf-trade" hint="e.g. Heavy diesel mechanic">
              <Input id="wf-trade" value={v.trade} onChange={(e) => setV({ ...v, trade: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Phone" htmlFor="wf-phone">
              <Input id="wf-phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} maxLength={30} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="wf-notes">
            <Textarea id="wf-notes" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={1000} />
          </Field>
          <label className="flex items-start gap-2.5 text-[14px] text-ink">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={v.available} onChange={(e) => setV({ ...v, available: e.target.checked })} />
            <span>
              Available for work orders
              <span className="block text-[12.5px] text-ink-muted">Untick to warn anyone assigning work to them.</span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type QDraft = { id?: string; kind: QualificationKind; label: string; number: string; issued_by: string; expires_on: string };

/** Add or edit a qualification. */
export function QualificationDialog({ orgId, userId, existing }: { orgId: string; userId: string; existing?: WorkforceQualification }) {
  const [open, setOpen] = React.useState(false);
  const { pending, error, setError, run } = useRun();
  const initial: QDraft = existing
    ? { id: existing.id, kind: existing.kind, label: existing.label ?? "", number: existing.number ?? "", issued_by: existing.issued_by ?? "", expires_on: existing.expires_on ?? "" }
    : { kind: "trade_certificate", label: "", number: "", issued_by: "", expires_on: "" };
  const [d, setD] = React.useState<QDraft>(initial);
  const set = (k: keyof QDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? setD(initial) : setError(null))}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm" aria-label="Edit qualification">
            <Pencil />
          </Button>
        ) : (
          <Button variant="secondary" size="sm">
            <Plus /> Add
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={existing ? "Edit qualification" : "Add a qualification"} description="The Owner and managers are warned 30 days before it expires.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveQualificationAction(orgId, userId, { ...d, id: d.id || undefined }), () => setOpen(false));
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="q-kind">
              <Select id="q-kind" value={d.kind} onChange={set("kind")}>
                {QUALIFICATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {QUALIFICATION_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={d.kind === "other" ? "Name" : "Details"} htmlFor="q-label" required={d.kind === "other"} hint={QUALIFICATION_LABEL_HINTS[d.kind]}>
              <Input id="q-label" value={d.label} onChange={set("label")} maxLength={80} />
            </Field>
            <Field label="Number" htmlFor="q-number">
              <Input id="q-number" value={d.number} onChange={set("number")} maxLength={60} />
            </Field>
            <Field label="Issued by" htmlFor="q-issuer">
              <Input id="q-issuer" value={d.issued_by} onChange={set("issued_by")} maxLength={80} />
            </Field>
            <Field label="Expires" htmlFor="q-expires" hint="Leave blank if it doesn't expire">
              <Input id="q-expires" type="date" value={d.expires_on} onChange={set("expires_on")} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : existing ? "Save" : "Add qualification"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteQualificationButton({ orgId, userId, id, title }: { orgId: string; userId: string; id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Remove ${title}`}
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ title: `Remove ${title}?`, confirmLabel: "Remove", danger: true }))) return;
        start(async () => {
          const res = await deleteQualificationAction(orgId, userId, id);
          if (res.status === "error") toast.error(res.message);
          else toast.success("Qualification removed");
          router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

/** Record annual, sick, training or other leave. */
export function AddLeaveDialog({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const [open, setOpen] = React.useState(false);
  const { pending, error, setError, run } = useRun();
  const empty = { kind: "annual", starts_on: "", ends_on: "", note: "" };
  const [v, setV] = React.useState(empty);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? setV(empty) : setError(null))}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus /> Add leave
        </Button>
      </DialogTrigger>
      <DialogContent title={`Leave · ${name}`} description="Anyone assigning work to them on these days sees a warning.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addLeaveAction(orgId, userId, v), () => setOpen(false));
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Type" htmlFor="l-kind">
              <Select id="l-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                {LEAVE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LEAVE_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="First day" htmlFor="l-start" required>
              <Input id="l-start" type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value, ends_on: v.ends_on || e.target.value })} />
            </Field>
            <Field label="Last day" htmlFor="l-end" required>
              <Input id="l-end" type="date" min={v.starts_on || undefined} value={v.ends_on} onChange={(e) => setV({ ...v, ends_on: e.target.value })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="l-note">
            <Input id="l-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={500} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add leave"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelLeaveButton({ orgId, userId, id, label }: { orgId: string; userId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ title: `Cancel ${label}?`, description: "It stays in the history.", confirmLabel: "Cancel leave", danger: true }))) return;
        start(async () => {
          const res = await cancelLeaveAction(orgId, userId, id);
          if (res.status === "error") toast.error(res.message);
          else toast.success("Leave cancelled");
          router.refresh();
        });
      }}
    >
      <X /> Cancel
    </Button>
  );
}
