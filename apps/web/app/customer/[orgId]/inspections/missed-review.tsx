"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { reviewMissedPrestartAction } from "./actions";

/** Review a missed pre-start: the equipment wasn't used, or the check was missed (with what was done). */
export function ReviewMissedDialog({ orgId, id, label }: { orgId: string; id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"not_used" | "missed">("not_used");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent title={`Missed pre-start · ${label}`} description="Was the equipment used without a pre-start?">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await reviewMissedPrestartAction(orgId, id, outcome, note);
              if (res.status === "error") return setError(res.message);
              toast.success("Review saved");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <fieldset className="flex flex-col gap-2">
            <label className="flex items-start gap-3 rounded-[10px] border border-stroke p-3">
              <input type="radio" name="outcome" className="mt-1 accent-[var(--brand)]" checked={outcome === "not_used"} onChange={() => setOutcome("not_used")} />
              <span>
                <span className="block text-[14px] font-semibold text-ink">Not used</span>
                <span className="block text-[13px] text-ink-muted">The equipment wasn&apos;t operated, so no pre-start was needed.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-[10px] border border-stroke p-3">
              <input type="radio" name="outcome" className="mt-1 accent-[var(--brand)]" checked={outcome === "missed"} onChange={() => setOutcome("missed")} />
              <span>
                <span className="block text-[14px] font-semibold text-ink">Missed</span>
                <span className="block text-[13px] text-ink-muted">It was used without a pre-start. Record what happened and what was done.</span>
              </span>
            </label>
          </fieldset>
          <Field label="Note" htmlFor="missed-note" required={outcome === "missed"} hint={outcome === "missed" ? "e.g. Operator spoken to; toolbox talk booked" : "Optional"}>
            <Textarea id="missed-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save review"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
