"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { archiveAssetAction } from "../actions";

export function ArchiveDialog({ orgId, assetId, assetNumber }: { orgId: string; assetId: string; assetNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await archiveAssetAction(orgId, assetId, prev, form);
    if (res.status === "success") {
      toast.success(res.message ?? "Archived");
      setOpen(false);
      router.refresh();
    }
    return res;
  }, idleState);
  const [disposal, setDisposal] = React.useState("disposed");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });

  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Archive /> Archive
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Archive ${assetNumber}`}
        description="Archiving keeps the full history, disables the equipment code and stops the asset counting towards the fleet subscription from the following month."
      >
        <form action={action} className="flex flex-col gap-4">
          {state.status === "error" && state.code !== "invalid" ? <FormAlert>{state.message}</FormAlert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reason for archiving" htmlFor="disposal">
              <Select name="disposal" value={disposal} onChange={(e) => setDisposal(e.target.value)}>
                <option value="disposed">Disposed</option>
                <option value="sold">Sold</option>
                <option value="transferred_out">Transferred out</option>
                <option value="written_off">Written off</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Effective date" htmlFor="effective_date" error={fe("effective_date")} required>
              <Input type="date" name="effective_date" defaultValue={today} />
            </Field>
          </div>
          <Field label="Details" htmlFor="reason" error={fe("reason")} required>
            <Textarea name="reason" rows={3} placeholder="e.g. Sold to dealer, invoice 4471" />
          </Field>
          {disposal === "sold" || disposal === "transferred_out" ? (
            <label className="flex items-start gap-2 text-[14px] text-ink">
              <input type="checkbox" name="open_issues_acknowledged" className="mt-0.5 size-4 accent-[var(--brand)]" />
              I acknowledge any open defects and holds on this asset before it leaves the company.
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Archiving…" : "Archive asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
