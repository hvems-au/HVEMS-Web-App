"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Gift, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { decideAdjustmentAction, requestAdjustmentAction, retryAdjustmentAction } from "./admin-actions";

const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

type Props =
  | { kind: "refund"; organisationId: string; maxCents: number; label: string; invoiceId?: string; engagementId?: string; feeSide?: "poster" | "provider" }
  | { kind: "credit"; organisationId: string }
  | { kind: "waiver_restore"; organisationId: string };

/** Refund, credit or waiver dialog (console). Over the threshold it goes for a second approval. */
export function AdjustmentButton(props: Props & { thresholdCents: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(props.kind === "refund" ? (props.maxCents / 100).toFixed(2) : "");
  const cents = Math.round(Number(amount.replace(/[^\d.]/g, "") || 0) * 100);
  const needsSecond = props.kind !== "waiver_restore" && cents > props.thresholdCents;

  const title = props.kind === "refund" ? `Refund ${props.label}` : props.kind === "credit" ? "Add a credit" : "Restore waivers";
  const description =
    props.kind === "refund"
      ? `Up to ${money(props.maxCents)} can be refunded to the card it was paid with.`
      : props.kind === "credit"
        ? "The credit comes off this organisation's next HVEMS invoice."
        : "Adds connection fee waivers to this month, for example after a cancellation the rules say shouldn't use one up.";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          {props.kind === "refund" ? <Undo2 /> : props.kind === "credit" ? <Gift /> : <RotateCcw />}
          {props.kind === "refund" ? "Refund" : props.kind === "credit" ? "Add credit" : "Restore waivers"}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError(null);
            const res = await requestAdjustmentAction({
              organisationId: props.organisationId,
              kind: props.kind,
              amount: props.kind === "waiver_restore" ? undefined : amount,
              quantity: props.kind === "waiver_restore" ? Number(f.get("quantity")) : undefined,
              reason: String(f.get("reason") ?? ""),
              invoiceId: props.kind === "refund" ? props.invoiceId : undefined,
              engagementId: props.kind === "refund" ? props.engagementId : undefined,
              feeSide: props.kind === "refund" ? props.feeSide : undefined,
            });
            setBusy(false);
            if (res.status === "error") return setError(res.message);
            toast.success(res.status === "success" ? (res.message ?? "Done") : "Done");
            setOpen(false);
            router.refresh();
          }}
        >
          {props.kind === "waiver_restore" ? (
            <Field label="How many" htmlFor="quantity" required>
              <Input name="quantity" type="number" min={1} max={20} defaultValue={1} required />
            </Field>
          ) : (
            <Field
              label="Amount (AUD)"
              htmlFor="amount"
              required
              hint={needsSecond ? `Over ${money(props.thresholdCents)}: a second billing approver must approve it before any money moves.` : undefined}
            >
              <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          )}
          <Field label="Reason" htmlFor="reason" required hint="Kept in the audit history. The customer sees the amount, not the reason.">
            <Textarea name="reason" rows={3} minLength={3} maxLength={1000} required />
          </Field>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {props.kind === "waiver_restore" ? "Restore" : needsSecond ? "Send for approval" : props.kind === "refund" ? "Refund now" : "Add credit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Approve or reject an adjustment waiting for a second approver. */
export function DecideAdjustment({ id, mine }: { id: string; mine: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  if (mine) return <span className="text-[12.5px] text-ink-subtle">Waiting for another approver</span>;
  const run = async (approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = await promptDialog({ title: "Reject this?", input: { label: "Why", required: true }, confirmLabel: "Reject", danger: true });
      if (note === null) return;
    }
    setBusy(true);
    const res = await decideAdjustmentAction(id, approve, note ?? undefined);
    setBusy(false);
    if (res.status === "error") return toast.error(res.message);
    toast.success(res.status === "success" ? (res.message ?? "Done") : "Done");
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => run(true)}>
        {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(false)}>
        <X /> Reject
      </Button>
    </div>
  );
}

export function RetryAdjustment({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await retryAdjustmentAction(id);
        setBusy(false);
        if (res.status === "error") return toast.error(res.message);
        toast.success("Done");
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry
    </Button>
  );
}
