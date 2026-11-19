"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PackageCheck, PackagePlus, ShoppingCart, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog, promptDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  cancelPartsRequestAction,
  decidePartsRequestAction,
  fitPartsAction,
  receivePartsAction,
  recordPartsOrderAction,
  returnFittedPartAction,
  submitPartsRequestAction,
} from "./actions";
import { qty } from "./status";

type Opt = { value: string; label: string };
type Result = { status: string; message?: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Something went wrong");
      else {
        toast.success(res.message ?? "Done");
        after?.();
      }
      router.refresh();
    });
  return { pending, run };
}

/** Submit, approve / reject, cancel: the request-level actions the person may take. */
export function RequestActions({
  orgId,
  id,
  label,
  canSubmit,
  canDecide,
  canCancel,
}: {
  orgId: string;
  id: string;
  label: string;
  canSubmit: boolean;
  canDecide: boolean;
  canCancel: boolean;
}) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit ? (
        <Button disabled={pending} onClick={() => run(() => submitPartsRequestAction(orgId, id))}>
          Submit request
        </Button>
      ) : null}
      {canDecide ? (
        <>
          <Button
            disabled={pending}
            onClick={async () => {
              if (await confirmDialog({ title: `Approve ${label}?`, description: "It can then be ordered.", confirmLabel: "Approve" }))
                run(() => decidePartsRequestAction(orgId, id, true, ""));
            }}
          >
            <Check /> Approve
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={async () => {
              const reason = await promptDialog({ title: `Reject ${label}?`, input: { label: "Reason", required: true, hint: "The requester sees this" }, confirmLabel: "Reject", danger: true });
              if (reason) run(() => decidePartsRequestAction(orgId, id, false, reason));
            }}
          >
            <X /> Reject
          </Button>
        </>
      ) : null}
      {canCancel ? (
        <Button
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            const reason = await promptDialog({ title: `Cancel ${label}?`, input: { label: "Reason", required: true }, confirmLabel: "Cancel request", danger: true });
            if (reason) run(() => cancelPartsRequestAction(orgId, id, reason));
          }}
        >
          Cancel request
        </Button>
      ) : null}
    </div>
  );
}

/** Record the order for one line (supplier, reference, dates, actual price). */
export function RecordOrderDialog({ orgId, lineId, description, suppliers, defaultSupplier }: { orgId: string; lineId: string; description: string; suppliers: Opt[]; defaultSupplier: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ supplierId: defaultSupplier ?? "", orderRef: "", orderedOn: new Date().toLocaleDateString("en-CA"), expectedOn: "", actualUnitCost: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <ShoppingCart /> Record order
        </Button>
      </DialogTrigger>
      <DialogContent title={`Order: ${description}`} description="Send the order by your usual email; record it here. More than 10% over the approved price goes back for approval.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await recordPartsOrderAction(orgId, { lineId, ...v });
              if (res.status === "error") return setError(res.message);
              toast.success(res.status === "success" ? (res.message ?? "Order recorded") : "Order recorded");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          {suppliers.length === 0 ? <FormAlert tone="info">Add the supplier first under Parts → Suppliers.</FormAlert> : null}
          <Field label="Supplier" htmlFor="o-supplier" required>
            <SearchableSelect id="o-supplier" name="supplier" label="Supplier" all="Choose…" allowEmpty={false} options={suppliers} value={v.supplierId} onChange={(x) => setV({ ...v, supplierId: x })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order reference" htmlFor="o-ref" required>
              <Input id="o-ref" value={v.orderRef} onChange={(e) => setV({ ...v, orderRef: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Actual price each (AUD)" htmlFor="o-cost" required>
              <Input id="o-cost" inputMode="decimal" value={v.actualUnitCost} onChange={(e) => setV({ ...v, actualUnitCost: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
            <Field label="Ordered on" htmlFor="o-on">
              <Input id="o-on" type="date" value={v.orderedOn} onChange={(e) => setV({ ...v, orderedOn: e.target.value })} />
            </Field>
            <Field label="Expected" htmlFor="o-exp">
              <Input id="o-exp" type="date" value={v.expectedOn} onChange={(e) => setV({ ...v, expectedOn: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Receive a delivery (partial is fine) or return parts to the supplier. */
export function ReceiveDialog({ orgId, lineId, description, outstanding, onHand, unit }: { orgId: string; lineId: string; description: string; outstanding: number; onHand: number; unit: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"receipt" | "return_to_supplier">(outstanding > 0 ? "receipt" : "return_to_supplier");
  const [quantity, setQuantity] = React.useState(String(outstanding > 0 ? outstanding : 1));
  const [receivedOn, setReceivedOn] = React.useState(new Date().toLocaleDateString("en-CA"));
  const [substitute, setSubstitute] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <PackageCheck /> {outstanding > 0 ? "Receive" : "Return"}
        </Button>
      </DialogTrigger>
      <DialogContent title={description} description={`${qty(outstanding)} ${unit} still to receive · ${qty(onHand)} received and not fitted`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await receivePartsAction(orgId, {
                lineId,
                kind,
                quantity,
                receivedOn,
                substituteReason: kind === "receipt" && substitute ? reason : "",
                returnReason: kind === "return_to_supplier" ? reason : "",
              });
              if (res.status === "error") return setError(res.message);
              toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="What happened" htmlFor="r-kind">
            <Select id="r-kind" value={kind} onChange={(e) => setKind(e.target.value as "receipt" | "return_to_supplier")}>
              <option value="receipt" disabled={outstanding <= 0}>
                Received from the supplier
              </option>
              <option value="return_to_supplier" disabled={onHand <= 0}>
                Returned to the supplier
              </option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Quantity (${unit})`} htmlFor="r-qty" required>
              <Input id="r-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="Date" htmlFor="r-date">
              <Input id="r-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </Field>
          </div>
          {kind === "receipt" ? (
            <label className="flex items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={substitute} onChange={(e) => setSubstitute(e.target.checked)} />
              A substitute part was supplied
            </label>
          ) : null}
          {kind === "return_to_supplier" || substitute ? (
            <Field label={kind === "return_to_supplier" ? "Why is it going back?" : "About the substitute"} htmlFor="r-reason" required>
              <Input id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Record parts used on a job (PRT-05): from parts received for this work order,
 * or bought on the spot. The price of an on-the-spot purchase is asked for, but
 * technicians never see what's posted to costs.
 */
export function FitPartsDialog({ orgId, workOrderId, received }: { orgId: string; workOrderId: string; received: { id: string; label: string; available: number; unit: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState(received.length ? received[0]!.id : "spot");
  const [quantity, setQuantity] = React.useState("1");
  const [description, setDescription] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [supplierName, setSupplierName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const line = received.find((r) => r.id === source);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PackagePlus /> Record parts used
        </Button>
      </DialogTrigger>
      <DialogContent title="Parts used on this job" description="From parts received for this job, or something you bought on the spot.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await fitPartsAction(orgId, {
                workOrderId,
                lineId: line ? line.id : "",
                quantity,
                description: line ? "" : description,
                unitCost: line ? "" : unitCost,
                supplierName: line ? "" : supplierName,
              });
              if (res.status === "error") return setError(res.message);
              toast.success("Part recorded on the job");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Part" htmlFor="f-source">
            <Select id="f-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {received.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({qty(r.available)} {r.unit} available)
                </option>
              ))}
              <option value="spot">Bought on the spot</option>
            </Select>
          </Field>
          {!line ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="What was it?" htmlFor="f-desc" required className="col-span-2">
                <Input id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="e.g. Cable ties (pack)" />
              </Field>
              <Field label="Price each (AUD)" htmlFor="f-cost" required>
                <Input id="f-cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
              <Field label="Bought from" htmlFor="f-supplier">
                <Input id="f-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={160} />
              </Field>
            </div>
          ) : null}
          <Field label={`Quantity${line ? ` (${line.unit})` : ""}`} htmlFor="f-qty" required>
            <Input id="f-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Return a fitted part from the job (reverses its cost; reason required). */
export function ReturnFittedButton({ orgId, usageId, label }: { orgId: string; usageId: string; label: string }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const reason = await promptDialog({ title: `Return ${label} from this job?`, description: "Its cost is reversed.", input: { label: "Reason", required: true }, confirmLabel: "Return" });
        if (reason) run(() => returnFittedPartAction(orgId, usageId, reason));
      }}
    >
      <Undo2 /> Return
    </Button>
  );
}
