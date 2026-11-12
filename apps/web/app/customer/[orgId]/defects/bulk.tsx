"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { closeDefectsBulkAction } from "./actions";

type Ctx = { selected: Set<string>; toggle: (id: string) => void };
const Selection = React.createContext<Ctx | null>(null);

/**
 * Bulk close for open defects. The table stays server-rendered; this wraps it,
 * adds a select-all / action bar on top and a checkbox per row (DefectCheck).
 */
export function DefectsBulk({ orgId, ids, children }: { orgId: string; ids: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [how, setHow] = React.useState<"repaired" | "no_fault" | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Forget ticks for rows no longer listed (after closing, searching or filtering).
  const key = ids.join(",");
  const [seen, setSeen] = React.useState(key);
  if (seen !== key) {
    setSeen(key);
    setSelected((s) => new Set([...s].filter((id) => ids.includes(id))));
  }

  const toggle = React.useCallback(
    (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const ctx = React.useMemo(() => ({ selected, toggle }), [selected, toggle]);
  const allOn = ids.length > 0 && selected.size === ids.length;

  const submit = () => {
    if (!how) return;
    setError(null);
    start(async () => {
      const res = await closeDefectsBulkAction(orgId, [...selected], how, note);
      if (res.status === "error") return setError(res.message);
      const d = res.status === "success" ? res.data : undefined;
      const parts = [`${d?.saved ?? 0} closed`];
      if (d?.awaitingReturn) parts.push(`${d.awaitingReturn} Critical now awaiting return to service`);
      if (d?.failed) parts.push(`${d.failed} couldn't be closed (not allowed or already closed)`);
      (d?.failed ? toast.warning : toast.success)(parts.join(" · "));
      setHow(null);
      setNote("");
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <Selection.Provider value={ctx}>
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-stroke px-4 py-2.5 transition-colors", selected.size ? "bg-brand-soft" : "bg-surface")}>
        <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand)]"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = selected.size > 0 && !allOn;
            }}
            onChange={() => setSelected(allOn ? new Set() : new Set(ids))}
            aria-label="Select all"
          />
          {selected.size ? `${selected.size} selected` : `Select all (${ids.length})`}
        </label>
        {selected.size ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setHow("no_fault")}>
              Close: no fault found
            </Button>
            <Button size="sm" onClick={() => setHow("repaired")}>
              Mark repaired
            </Button>
          </div>
        ) : null}
      </div>
      {children}
      <Dialog open={how !== null} onOpenChange={(o) => !o && setHow(null)}>
        <DialogContent
          title={how === "repaired" ? `Mark ${selected.size} repaired` : `Close ${selected.size}: no fault found`}
          description={
            how === "repaired"
              ? "The same repair note goes on each. Critical defects then wait for someone to return the equipment to service."
              : "Checked and nothing needs repairing. The same reason goes on each."
          }
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field
              label={how === "repaired" ? "Repair details" : "Reason"}
              htmlFor="bulk-defect-note"
              required
              hint={how === "repaired" ? "e.g. Replaced front left tyre; checked pressures" : "e.g. Inspected by workshop; within limits"}
            >
              <Textarea id="bulk-defect-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setHow(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : `Close ${selected.size}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Selection.Provider>
  );
}

/** Row checkbox (sits above the row's whole-row link). */
export function DefectCheck({ id, label }: { id: string; label: string }) {
  const ctx = React.useContext(Selection);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="relative z-10 size-4 accent-[var(--brand)]"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label={`Select ${label}`}
    />
  );
}
