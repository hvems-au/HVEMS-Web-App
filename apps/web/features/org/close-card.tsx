"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { closeOrganisationAction, reopenOrganisationAction } from "./close-actions";

/**
 * Close the organisation (ACC): a full export from the last 7 days first, nothing in progress, then type the
 * name to confirm. Members lose access; history is kept and HVEMS can reopen it.
 */
export function CloseOrganisationCard({ orgId, name, blockers, exportHref }: { orgId: string; name: string; blockers: string[]; exportHref: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Card className="mt-5 border-danger/30">
      <CardHeader title="Close this account" description="For when you stop using HVEMS. Everyone loses access; the records are kept and HVEMS can reopen the account if needed." />
      <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
        {blockers.length ? (
          <div className="flex flex-col gap-2 rounded-[10px] border border-warn-line bg-warn-soft p-3.5 text-warn-ink">
            <p className="font-medium">Before you can close it:</p>
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <a href={exportHref} className="inline-flex items-center gap-1.5 self-start font-semibold underline">
              <Download className="size-4" aria-hidden /> Download a full export
            </a>
          </div>
        ) : null}
        {!open ? (
          <Button variant="secondary" className="self-start" disabled={blockers.length > 0} onClick={() => setOpen(true)}>
            <AlertTriangle /> Close this account…
          </Button>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setBusy(true);
              const res = await closeOrganisationAction(orgId, confirm, reason);
              setBusy(false);
              if (res.status === "error") return setError(res.message);
              toast.success("The account is closed");
              router.push("/");
              router.refresh();
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field label="Why are you closing it?" htmlFor="close-reason" required>
              <Textarea id="close-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </Field>
            <Field label={`Type "${name}" to confirm`} htmlFor="close-name" required>
              <Input id="close-name" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </Field>
            <p className="text-[13px] text-ink-muted">Open marketplace jobs are withdrawn and active proposals withdrawn. Billing stops once billing is live.</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Back
              </Button>
              <Button type="submit" disabled={busy || confirm !== name || reason.trim().length < 3}>
                {busy ? <Loader2 className="animate-spin" /> : null} Close the account
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

export function ReopenOrganisationButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        const reason = await promptDialog({ title: "Reopen this organisation?", description: "Its members get their access back.", input: { label: "Reason", required: true }, confirmLabel: "Reopen" });
        if (!reason) return;
        const res = await reopenOrganisationAction(orgId, reason);
        if (res.status === "error") toast.error(res.message);
        else toast.success("Reopened");
        router.refresh();
      }}
    >
      <RotateCcw /> Reopen
    </Button>
  );
}
