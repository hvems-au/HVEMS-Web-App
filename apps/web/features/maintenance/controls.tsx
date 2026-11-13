"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { WorkOrderAction } from "@hvems/api-client";
import { QUALIFICATION_LABELS, REQUIRABLE_QUALIFICATIONS, type AllocationWarning } from "@hvems/domain";
import { allocationWarningsAction } from "@/features/workforce/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createServicePlanAction, createWorkOrderAction, setServicePlanActiveAction, workOrderStatusAction } from "./actions";
import { confirmDialog } from "@/components/ui/confirm";

type Opt = { value: string; label: string };

function useForm<T extends Record<string, string>>(initial: T) {
  const [v, setV] = React.useState<T>(initial);
  const set = (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  // For searchable dropdowns, which hand back the chosen value.
  const pick = (k: keyof T) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  return { v, set, pick, reset: () => setV(initial) };
}

/** Add a service plan: every N days, kilometres and/or hours, from the last service. */
export function AddServicePlanDialog({ orgId, equipment, assetId }: { orgId: string; equipment: Opt[]; assetId?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const f = useForm({ asset_id: assetId ?? "", name: "", interval_days: "", interval_km: "", interval_hours: "", last_done_on: "", last_done_km: "", last_done_hours: "", notes: "" });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? null : (f.reset(), setError(null)))}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add service plan
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a service plan" description="Repeats at whichever interval comes first.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createServicePlanAction(orgId, f.v);
              if (res.status === "error") return setError(res.message);
              toast.success("Service plan added");
              setOpen(false);
              f.reset();
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          {assetId ? null : (
            <Field label="Equipment" htmlFor="sp-asset" required>
              <SearchableSelect id="sp-asset" name="asset_id" label="Equipment" all="Choose…" options={equipment} value={f.v.asset_id} onChange={f.pick("asset_id")} allowEmpty={false} />
            </Field>
          )}
          <Field label="Service" htmlFor="sp-name" required hint="e.g. 250-hour service, Annual inspection, 15,000 km service">
            <Input id="sp-name" value={f.v.name} onChange={f.set("name")} maxLength={120} />
          </Field>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Every (at least one)</legend>
            <Field label="Days" htmlFor="sp-days">
              <Input id="sp-days" inputMode="numeric" value={f.v.interval_days} onChange={f.set("interval_days")} placeholder="e.g. 365" />
            </Field>
            <Field label="Kilometres" htmlFor="sp-km">
              <Input id="sp-km" inputMode="decimal" value={f.v.interval_km} onChange={f.set("interval_km")} placeholder="e.g. 15000" />
            </Field>
            <Field label="Hours" htmlFor="sp-hours">
              <Input id="sp-hours" inputMode="decimal" value={f.v.interval_hours} onChange={f.set("interval_hours")} placeholder="e.g. 250" />
            </Field>
          </fieldset>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Last done (if known)</legend>
            <Field label="Date" htmlFor="sp-last-date">
              <Input id="sp-last-date" type="date" value={f.v.last_done_on} onChange={f.set("last_done_on")} />
            </Field>
            <Field label="At km" htmlFor="sp-last-km">
              <Input id="sp-last-km" inputMode="decimal" value={f.v.last_done_km} onChange={f.set("last_done_km")} />
            </Field>
            <Field label="At hours" htmlFor="sp-last-hours">
              <Input id="sp-last-hours" inputMode="decimal" value={f.v.last_done_hours} onChange={f.set("last_done_hours")} />
            </Field>
          </fieldset>
          <Field label="Notes" htmlFor="sp-notes">
            <Textarea id="sp-notes" rows={2} value={f.v.notes} onChange={f.set("notes")} maxLength={2000} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add plan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemovePlanButton({ orgId, id, name }: { orgId: string; id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ title: `Remove "${name}" from the schedule?`, description: "Its history stays in the audit records.", confirmLabel: "Remove", danger: true }))) return;
        start(async () => {
          const res = await setServicePlanActiveAction(orgId, id, false);
          if (res.status === "error") toast.error(res.message);
          router.refresh();
        });
      }}
    >
      Remove
    </Button>
  );
}

/** New work order (internal or a named vendor), optionally for a service plan. */
export function NewWorkOrderDialog({
  orgId,
  equipment,
  people,
  preset,
  label = "New work order",
  variant = "primary",
}: {
  orgId: string;
  equipment: Opt[];
  people: Opt[];
  preset?: { asset_id: string; title: string; service_plan_id?: string };
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const f = useForm({
    asset_id: preset?.asset_id ?? "",
    title: preset?.title ?? "",
    description: "",
    kind: "internal",
    vendor_name: "",
    priority: "normal",
    assigned_to: "",
    due_on: "",
    service_plan_id: preset?.service_plan_id ?? "",
    required_qualification: "",
  });
  // Allocation warnings from the database as the person, due date or requirement changes.
  const [warnings, setWarnings] = React.useState<AllocationWarning[]>([]);
  const who = f.v.kind === "internal" ? f.v.assigned_to : "";
  React.useEffect(() => {
    if (!open || !who) return;
    let live = true;
    const t = setTimeout(() => {
      allocationWarningsAction(orgId, who, f.v.due_on, f.v.required_qualification).then((w) => live && setWarnings(w));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, orgId, who, f.v.due_on, f.v.required_qualification]);
  const shown = who ? warnings : [];
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? null : setError(null))}>
      <DialogTrigger asChild>
        <Button size={preset ? "sm" : "md"} variant={variant}>
          {preset ? <Wrench /> : <Plus />} {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={label} description="A technician completes it; a manager reviews and closes it.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createWorkOrderAction(orgId, f.v);
              if (res.status === "error") return setError(res.message);
              toast.success("Work order created");
              setOpen(false);
              if (res.status === "success" && res.data) router.push(`/customer/${orgId}/work-orders/${res.data.id}`);
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          {preset ? null : (
            <Field label="Equipment" htmlFor="wo-asset" required>
              <SearchableSelect id="wo-asset" name="asset_id" label="Equipment" all="Choose…" options={equipment} value={f.v.asset_id} onChange={f.pick("asset_id")} allowEmpty={false} />
            </Field>
          )}
          <Field label="Title" htmlFor="wo-title" required>
            <Input id="wo-title" value={f.v.title} onChange={f.set("title")} maxLength={160} />
          </Field>
          <Field label="Description" htmlFor="wo-desc">
            <Textarea id="wo-desc" rows={3} value={f.v.description} onChange={f.set("description")} maxLength={4000} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Done by" htmlFor="wo-kind">
              <Select id="wo-kind" value={f.v.kind} onChange={f.set("kind")}>
                <option value="internal">In-house</option>
                <option value="vendor">Outside vendor</option>
              </Select>
            </Field>
            {f.v.kind === "vendor" ? (
              <Field label="Vendor" htmlFor="wo-vendor" required>
                <Input id="wo-vendor" value={f.v.vendor_name} onChange={f.set("vendor_name")} maxLength={160} />
              </Field>
            ) : (
              <Field
                label="Assigned to"
                htmlFor="wo-assignee"
                hint={people.length ? "Technicians only. Leave unassigned and any technician can pick it up." : "No technicians yet. Add one on the Team page, or leave it unassigned."}
              >
                <SearchableSelect id="wo-assignee" name="assigned_to" label="Technician" all="Not assigned yet" options={people} value={f.v.assigned_to} onChange={f.pick("assigned_to")} />
              </Field>
            )}
            <Field label="Priority" htmlFor="wo-priority">
              <Select id="wo-priority" value={f.v.priority} onChange={f.set("priority")}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
            <Field label="Due" htmlFor="wo-due">
              <Input id="wo-due" type="date" value={f.v.due_on} onChange={f.set("due_on")} />
            </Field>
            {f.v.kind === "internal" ? (
              <Field label="Needs" htmlFor="wo-needs" hint="Qualification the work needs (optional)">
                <Select id="wo-needs" value={f.v.required_qualification} onChange={f.set("required_qualification")}>
                  <option value="">Nothing specific</option>
                  {REQUIRABLE_QUALIFICATIONS.map((k) => (
                    <option key={k} value={k}>
                      {QUALIFICATION_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          {shown.length ? (
            <div role="status" className="rounded-[8px] border border-warn-line bg-warn-soft px-3 py-2.5 text-[13px] text-warn-ink">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" aria-hidden /> Check before assigning
              </p>
              <ul className="mt-1 list-disc pl-5">
                {shown.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
              <p className="mt-1 text-[12px]">You can still create it; the warning is saved with the work order.</p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create work order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Status buttons for a work order. The database decides who may do what. */
export function WorkOrderActions({ orgId, id, status, manager, meters }: { orgId: string; id: string; status: string; manager: boolean; meters: { km: boolean; hours: boolean } }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const f = useForm({ notes: "", odometer_km: "", engine_hours: "", labour_hours: "", cost: "" });
  const run = (action: WorkOrderAction, extra?: Parameters<typeof workOrderStatusAction>[3]) =>
    start(async () => {
      const res = await workOrderStatusAction(orgId, id, action, extra);
      if (res.status === "error") {
        if (action === "complete") setError(res.message);
        else toast.error(res.message);
        return;
      }
      toast.success(res.status === "success" ? (res.message ?? "Done") : "Done");
      setCompleteOpen(false);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" ? (
        <Button size="sm" disabled={pending} onClick={() => run("start")}>
          Start work
        </Button>
      ) : null}
      {status === "open" || status === "in_progress" ? (
        <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant={status === "open" ? "secondary" : "primary"}>
              Mark complete
            </Button>
          </DialogTrigger>
          <DialogContent title="Mark work complete" description="A manager reviews and closes it.">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                run("complete", f.v);
              }}
            >
              {error ? <FormAlert>{error}</FormAlert> : null}
              <Field label="Work done" htmlFor="wo-notes" required>
                <Textarea id="wo-notes" rows={3} value={f.v.notes} onChange={f.set("notes")} maxLength={4000} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                {meters.km ? (
                  <Field label="Odometer (km)" htmlFor="wo-km">
                    <Input id="wo-km" inputMode="decimal" value={f.v.odometer_km} onChange={f.set("odometer_km")} />
                  </Field>
                ) : null}
                {meters.hours ? (
                  <Field label="Hour meter (hours)" htmlFor="wo-hours">
                    <Input id="wo-hours" inputMode="decimal" value={f.v.engine_hours} onChange={f.set("engine_hours")} />
                  </Field>
                ) : null}
                <Field label="Labour (hours)" htmlFor="wo-labour">
                  <Input id="wo-labour" inputMode="decimal" value={f.v.labour_hours} onChange={f.set("labour_hours")} />
                </Field>
                <Field label="Cost (AUD)" htmlFor="wo-cost" hint="Parts and outside work">
                  <Input id="wo-cost" inputMode="decimal" value={f.v.cost} onChange={f.set("cost")} placeholder="e.g. 480.00" />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Mark complete"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {manager && status === "completed" ? (
        <NoteActionDialog
          trigger={<Button size="sm">Review and close</Button>}
          title="Review and close"
          description="Check the work recorded, then close the work order. Closing a service work order records the service as done."
          label="Review note"
          hint="Optional, e.g. Checked; invoice matches quote"
          submitLabel="Close work order"
          onSubmit={(notes) => workOrderStatusAction(orgId, id, "close", { notes: notes || undefined })}
        />
      ) : null}
      {manager && (status === "completed" || status === "closed") ? (
        <NoteActionDialog
          trigger={
            <Button size="sm" variant="secondary">
              Reopen
            </Button>
          }
          title="Reopen work order"
          description="It goes back to in progress so the work can be finished or corrected."
          label="Why is it being reopened?"
          required
          submitLabel="Reopen"
          onSubmit={(notes) => workOrderStatusAction(orgId, id, "reopen", { notes })}
        />
      ) : null}
      {manager && status !== "closed" && status !== "cancelled" ? (
        <NoteActionDialog
          trigger={
            <Button size="sm" variant="ghost">
              Cancel work order
            </Button>
          }
          title="Cancel work order"
          description="The work order is kept in the history as cancelled."
          label="Why is it being cancelled?"
          required
          danger
          submitLabel="Cancel work order"
          onSubmit={(notes) => workOrderStatusAction(orgId, id, "cancel", { notes })}
        />
      ) : null}
    </div>
  );
}

/** A note-and-confirm dialog in the HVEMS style (replaces browser pop-ups). */
function NoteActionDialog({
  trigger,
  title,
  description,
  label,
  hint,
  required = false,
  danger = false,
  submitLabel,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  label: string;
  hint?: string;
  required?: boolean;
  danger?: boolean;
  submitLabel: string;
  onSubmit: (notes: string) => Promise<{ status: string; message?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setNotes("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (required && notes.trim().length < 3) return setError("Add a short note (at least 3 characters).");
            start(async () => {
              const res = await onSubmit(notes.trim());
              if (res.status === "error") return setError(res.message ?? "Something went wrong");
              toast.success(res.message ?? "Saved");
              setOpen(false);
              setNotes("");
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label={label} htmlFor="note-action" required={required} hint={hint}>
            <Textarea id="note-action" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
