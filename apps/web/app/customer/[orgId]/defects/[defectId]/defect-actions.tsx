"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, CheckCircle2, GitMerge, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { DEFECT_SEVERITY_EFFECT, DEFECT_SEVERITY_LABELS } from "@hvems/domain";
import type { DefectSeverityValue } from "@hvems/types";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { clearDefectAction, deferDefectAction, dismissDefectAction, mergeDefectAction, triageDefectAction } from "../actions";

type Result = { status: "idle" | "success" | "error"; message?: string };
const RANK: Record<DefectSeverityValue, number> = { advisory: 0, minor: 1, critical: 2 };

export interface DefectActionsProps {
  orgId: string;
  assetId: string;
  defect: { id: string; severity: DefectSeverityValue; title: string; due: string | null; deferLimit: string | null };
  can: { triage: boolean; lower: boolean; dismissCritical: boolean; defer: boolean; clearCritical: boolean; clearOther: boolean };
  otherOpen: { id: string; title: string; severity: DefectSeverityValue }[];
  members: { userId: string; name: string }[];
  meId: string;
  repairerRule: boolean;
}

/** One dialog runner: submit, toast, refresh, close. */
function useStep(onDone?: () => void) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const submit = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Saved");
        setOpen(false);
        onDone?.();
        router.refresh();
      } else setError(res.message ?? "Something went wrong");
    });
  return { open, setOpen: (o: boolean) => (setOpen(o), setError(null)), error, pending, submit };
}

export function DefectActions(p: DefectActionsProps) {
  const isCritical = p.defect.severity === "critical";
  const canClear = isCritical ? p.can.clearCritical : p.can.clearOther;
  return (
    <div className="flex flex-wrap gap-2">
      {canClear ? <ClearDialog {...p} /> : null}
      {p.can.triage ? <TriageDialog {...p} /> : null}
      {p.can.defer && p.defect.severity === "minor" ? <DeferDialog {...p} /> : null}
      {p.can.triage && p.otherOpen.length ? <MergeDialog {...p} /> : null}
      {p.can.triage && (!isCritical || p.can.dismissCritical) ? <DismissDialog {...p} /> : null}
    </div>
  );
}

function ClearDialog({ orgId, assetId, defect, members, meId, repairerRule }: DefectActionsProps) {
  const s = useStep();
  const [details, setDetails] = React.useState("");
  const [repairer, setRepairer] = React.useState(meId);
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [folder] = React.useState(() => `defect-${defect.id}`);
  const critical = defect.severity === "critical";
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CheckCircle2 /> Mark repaired
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Mark repaired"
        description={
          critical
            ? "Step 1 of 2. The equipment stays Out of service until someone returns it to service from the equipment page."
            : "The defect is closed and stops affecting the equipment's condition."
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => clearDefectAction(orgId, assetId, { defectId: defect.id, repairDetails: details, repairedBy: repairer, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="What was repaired" htmlFor="c-details" required>
            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Replaced breakaway cable; tested brakes apply" />
          </Field>
          <Field
            label="Repaired by"
            htmlFor="c-repairer"
            hint={critical && repairerRule ? "Your company requires someone other than the repairer to clear Critical repairs." : undefined}
          >
            <Select value={repairer} onChange={(e) => setRepairer(e.target.value)}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === meId ? " (me)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photos of the repair (recommended)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={folder} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => s.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={s.pending || busy || details.trim().length < 3}>
              {s.pending ? "Saving…" : "Mark repaired"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TriageDialog({ orgId, assetId, defect, can }: DefectActionsProps) {
  const s = useStep();
  const [severity, setSeverity] = React.useState<DefectSeverityValue>(defect.severity);
  const [reason, setReason] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [folder] = React.useState(() => `defect-${defect.id}`);
  const lowering = RANK[severity] < RANK[defect.severity];
  const needsEvidence = lowering && defect.severity === "critical";
  const options = (["critical", "minor", "advisory"] as const).filter((o) => RANK[o] >= RANK[defect.severity] || can.lower);
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <ListChecks /> Triage
        </Button>
      </DialogTrigger>
      <DialogContent title="Triage defect" description="Confirm the severity, or change it if it was reported wrongly.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => triageDefectAction(orgId, assetId, { defectId: defect.id, severity, reason, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Severity" htmlFor="t-severity" hint={DEFECT_SEVERITY_EFFECT[severity]}>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as DefectSeverityValue)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {DEFECT_SEVERITY_LABELS[o]}
                  {o === defect.severity ? " (as reported)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={lowering ? "Reason for lowering" : "Note"} htmlFor="t-reason" required={lowering}>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={lowering ? "Why is it less serious than reported?" : "Optional"} />
          </Field>
          {needsEvidence ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-ink">
                Photo evidence <span className="text-danger">*</span>
              </span>
              <span className="text-[13px] text-ink-subtle">Lowering a Critical defect needs at least one photo.</span>
              <PhotoPicker orgId={orgId} assetId={assetId} folder={folder} onChange={setEvidence} onBusyChange={setBusy} />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => s.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={s.pending || busy || (lowering && reason.trim().length < 3) || (needsEvidence && evidence.length === 0)}>
              {s.pending ? "Saving…" : severity === defect.severity ? "Confirm severity" : "Change severity"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeferDialog({ orgId, assetId, defect }: DefectActionsProps) {
  const s = useStep();
  const [due, setDue] = React.useState("");
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <CalendarClock /> Defer
        </Button>
      </DialogTrigger>
      <DialogContent title="Defer the repair" description="Minor defects only. The equipment keeps Needs attention until repaired.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => deferDefectAction(orgId, assetId, { defectId: defect.id, newDue: due, reason }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="New due date" htmlFor="d-due" required hint={defect.deferLimit ? `No later than ${defect.deferLimit}` : undefined}>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="d-reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Part on order, arriving next week" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => s.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={s.pending || !due || reason.trim().length < 3}>
              {s.pending ? "Saving…" : "Defer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ orgId, assetId, defect, otherOpen }: DefectActionsProps) {
  const s = useStep();
  const [into, setInto] = React.useState(otherOpen[0]?.id ?? "");
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <GitMerge /> Merge duplicate
        </Button>
      </DialogTrigger>
      <DialogContent title="Merge into another defect" description="Use this when the same fault was reported twice. The kept defect takes the more serious severity.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => mergeDefectAction(orgId, assetId, { defectId: defect.id, intoId: into, reason }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Keep this defect" htmlFor="m-into" required>
            <Select value={into} onChange={(e) => setInto(e.target.value)}>
              {otherOpen.map((o) => (
                <option key={o.id} value={o.id}>
                  [{DEFECT_SEVERITY_LABELS[o.severity]}] {o.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="m-reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => s.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={s.pending || !into}>
              {s.pending ? "Merging…" : "Merge"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({ orgId, assetId, defect }: DefectActionsProps) {
  const s = useStep();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Ban /> Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent title="Dismiss defect" description="Only when the fault isn't real, for example a misread gauge. The reason is kept in the audit history.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => dismissDefectAction(orgId, assetId, { defectId: defect.id, reason }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Reason" htmlFor="x-reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Operator misread the gauge; checked, level is fine" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => s.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={s.pending || reason.trim().length < 3}>
              {s.pending ? "Dismissing…" : "Dismiss defect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
