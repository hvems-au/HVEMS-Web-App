"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { returnToServiceAction } from "../../defects/actions";

/** Step 2 of clearance: a person with the right confirms the equipment is fit to use. */
export function ReturnToServiceDialog({ orgId, assetId, assetNumber }: { orgId: string; assetId: string; assetNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [folder] = React.useState(() => `rts-${crypto.randomUUID()}`);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button>
          <ShieldCheck /> Return to service
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Return ${assetNumber} to service`}
        description="Step 2 of 2. Confirm the repairs are done and the equipment is fit to use. It becomes Active again."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await returnToServiceAction(orgId, assetId, { note, evidence });
              if (res.status === "success") {
                toast.success(res.message ?? "Returned to service");
                setOpen(false);
                router.refresh();
              } else if (res.status === "error") setError(res.message);
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="How did you confirm it's fit to use?" htmlFor="rts-note" required>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Test-towed 2 km, brakes and breakaway checked, pre-start completed" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photos (optional)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={folder} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || busy || note.trim().length < 3}>
              {pending ? "Saving…" : "Return to service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
