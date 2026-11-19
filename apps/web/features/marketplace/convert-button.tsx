"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { convertJobAssetAction, convertToCompanyAction } from "./actions";

/** Convert a marketplace-only account to a company (CS-09). Account Owner only; the database checks. */
export function ConvertToCompanyButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        const ok = await confirmDialog({
          title: "Convert to a company account?",
          description:
            "You become the Owner and Job Managers become Fleet Managers who can still post jobs. Your jobs, engagements and history stay. You can then add equipment; the first five are free and a fleet subscription applies above that.",
          confirmLabel: "Convert",
        });
        if (!ok) return;
        setBusy(true);
        const res = await convertToCompanyAction(orgId);
        setBusy(false);
        if (res.status === "error") return toast.error(res.message);
        toast.success("Your account is now a company");
        router.push(`/customer/${orgId}/dashboard`);
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Building2 />} Convert to a company
    </Button>
  );
}

const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];

/** AST-04: turn the equipment described on a past job into managed equipment; its jobs move with it. */
export function ConvertJobAssetDialog({
  orgId,
  jobId,
  described,
  classes,
}: {
  orgId: string;
  jobId: string;
  described: { make?: string; model?: string; registration?: string };
  classes: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ assetNumber: "", classId: "", make: described.make ?? "", model: described.model ?? "", registration: described.registration ?? "", state: "QLD" });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Truck /> Add to my equipment
        </Button>
      </DialogTrigger>
      <DialogContent title="Add this equipment to your register" description="It becomes managed equipment, and this job (and others with the same registration) stays in its history.">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!f.assetNumber.trim()) return setError("Give it an equipment ID.");
            if (!f.classId) return setError("Choose the class.");
            setBusy(true);
            const res = await convertJobAssetAction(orgId, jobId, f);
            setBusy(false);
            if (res.status === "error") return setError(res.message);
            toast.success("Added to your equipment");
            setOpen(false);
            router.refresh();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Equipment ID" htmlFor="cja-id" required>
              <Input id="cja-id" value={f.assetNumber} onChange={(e) => setF({ ...f, assetNumber: e.target.value })} maxLength={40} placeholder="e.g. SK-01" />
            </Field>
            <Field label="Class" htmlFor="cja-class" required>
              <SearchableSelect id="cja-class" name="class" label="Class" all="Choose…" allowEmpty={false} value={f.classId} options={classes} onChange={(v) => setF({ ...f, classId: v })} />
            </Field>
            <Field label="Make" htmlFor="cja-make">
              <Input id="cja-make" value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} />
            </Field>
            <Field label="Model" htmlFor="cja-model">
              <Input id="cja-model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
            </Field>
            <Field label="Registration" htmlFor="cja-rego">
              <Input id="cja-rego" value={f.registration} onChange={(e) => setF({ ...f, registration: e.target.value })} />
            </Field>
            <Field label="State" htmlFor="cja-state">
              <Select id="cja-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-[12.5px] text-ink-muted">Other details the class requires can be added on the equipment page.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Add equipment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
