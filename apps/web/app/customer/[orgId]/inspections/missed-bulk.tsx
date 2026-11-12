"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { Badge, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { reviewMissedPrestartsBulkAction } from "./actions";
import { ReviewMissedDialog } from "./missed-review";

export type MissedRow = { id: string; due: string; assetId: string; assetNumber: string; makeModel: string; check: string };
type Outcome = "not_used" | "missed";

/**
 * Missed pre-starts waiting for review: tick several (or all) and mark them
 * "Not used" or "Missed" in one go, or review one at a time.
 */
export function MissedBulkTable({ orgId, rows }: { orgId: string; rows: MissedRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<Outcome | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Drop ticks for rows that are no longer listed (after a review or a filter).
  const ids = rows.map((r) => r.id).join(",");
  const [seen, setSeen] = React.useState(ids);
  if (seen !== ids) {
    setSeen(ids);
    setSelected((s) => new Set([...s].filter((id) => rows.some((r) => r.id === id))));
  }

  const allOn = rows.length > 0 && selected.size === rows.length;
  const someOn = selected.size > 0 && !allOn;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = (outcome: Outcome) => {
    setError(null);
    start(async () => {
      const res = await reviewMissedPrestartsBulkAction(orgId, [...selected], outcome, note);
      if (res.status === "error") return setError(res.message);
      const d = res.status === "success" ? res.data : undefined;
      if (d?.failed) toast.warning(`${d.saved} reviewed; ${d.failed} couldn't be saved (already reviewed or not allowed)`);
      else toast.success(`${d?.saved ?? selected.size} marked ${outcome === "not_used" ? "not used" : "missed"}`);
      setDialog(null);
      setNote("");
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <>
      <div
        className={cn(
          "sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-stroke px-4 py-2.5 transition-colors",
          selected.size ? "bg-brand-soft" : "bg-surface",
        )}
      >
        <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand)]"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = someOn;
            }}
            onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
            aria-label="Select all"
          />
          {selected.size ? `${selected.size} selected` : `Select all (${rows.length})`}
        </label>
        {selected.size ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDialog("not_used")}>
              Mark not used
            </Button>
            <Button size="sm" onClick={() => setDialog("missed")}>
              Mark missed
            </Button>
          </div>
        ) : null}
      </div>
      <Table>
        <THead>
          <tr>
            <TH className="w-px">
              <span className="sr-only">Select</span>
            </TH>
            <TH>Due</TH>
            <TH>Equipment</TH>
            <TH>Check</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((m) => (
            <TR key={m.id} className={cn(selected.has(m.id) && "bg-brand-soft/50")}>
              <TD>
                <input
                  type="checkbox"
                  className="relative z-10 size-4 accent-[var(--brand)]"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  aria-label={`Select ${m.assetNumber}, ${m.due}`}
                />
              </TD>
              <TD className="whitespace-nowrap">{m.due}</TD>
              <TD>
                <Link href={`/customer/${orgId}/equipment/${m.assetId}`} className="font-semibold text-link hover:underline">
                  {m.assetNumber}
                </Link>
                {m.makeModel ? <span className="block text-[12.5px] text-ink-subtle">{m.makeModel}</span> : null}
              </TD>
              <TD>{m.check}</TD>
              <TD>
                <Badge tone="amber">To review</Badge>
              </TD>
              <TD className="text-right">
                <ReviewMissedDialog orgId={orgId} id={m.id} label={`${m.assetNumber}, ${m.due}`} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title={dialog === "missed" ? `Mark ${selected.size} as missed` : `Mark ${selected.size} as not used`}
          description={
            dialog === "missed"
              ? "The equipment was used without a pre-start. Record what happened and what was done; the same note goes on each."
              : "The equipment wasn't operated, so no pre-start was needed."
          }
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog) submit(dialog);
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field
              label="Note"
              htmlFor="bulk-note"
              required={dialog === "missed"}
              hint={dialog === "missed" ? "e.g. Operators spoken to; toolbox talk booked" : "Optional, e.g. Site closed for rain"}
            >
              <Textarea id="bulk-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : `Save ${selected.size} review${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
