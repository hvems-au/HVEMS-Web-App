"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { generateCodeAction } from "./code-actions";

export function GenerateCodeButton({ orgId, assetId }: { orgId: string; assetId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await generateCodeAction(orgId, assetId);
          if (res.status === "success") {
            toast.success(res.message ?? "Done");
            router.refresh();
          } else if (res.status === "error") toast.error(res.message);
        })
      }
    >
      <QrCode /> {pending ? "Generating…" : "Generate QR code"}
    </Button>
  );
}

export function ReplaceCodeButton({ orgId, assetId }: { orgId: string; assetId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <RefreshCw /> Replace code
        </Button>
      </DialogTrigger>
      <DialogContent title="Replace the QR code" description="The current label stops working straight away. Print and fit the new label.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await generateCodeAction(orgId, assetId, reason);
              if (res.status === "success") {
                toast.success(res.message ?? "Done");
                setOpen(false);
                router.refresh();
              } else if (res.status === "error") setError(res.message);
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Reason" htmlFor="rc-reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Label damaged" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending || reason.trim().length < 3}>
              {pending ? "Replacing…" : "Replace code"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
