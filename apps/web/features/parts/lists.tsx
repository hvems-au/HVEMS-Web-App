"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { saveCatalogueItemAction, saveSupplierAction } from "./actions";

type SupplierValues = { id?: string; name: string; abn: string; contact_name: string; email: string; phone: string; account_number: string; notes: string };

/** Add or edit a supplier (PRT-07). */
export function SupplierDialog({ orgId, supplier }: { orgId: string; supplier?: SupplierValues & { archived?: boolean } }) {
  const router = useRouter();
  const empty: SupplierValues = { name: "", abn: "", contact_name: "", email: "", phone: "", account_number: "", notes: "" };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<SupplierValues>(supplier ?? empty);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = (k: keyof SupplierValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const save = (archived: boolean) =>
    start(async () => {
      setError(null);
      const res = await saveSupplierAction(orgId, { ...v, archived });
      if (res.status === "error") return setError(res.message);
      toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? setV(supplier ?? empty) : null, setError(null))}>
      <DialogTrigger asChild>
        {supplier ? (
          <Button size="sm" variant="ghost">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> Add supplier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={supplier ? `Edit ${supplier.name}` : "Add supplier"}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Name" htmlFor="sup-name" required>
            <Input id="sup-name" value={v.name} onChange={set("name")} maxLength={160} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ABN" htmlFor="sup-abn">
              <Input id="sup-abn" inputMode="numeric" value={v.abn} onChange={set("abn")} maxLength={14} />
            </Field>
            <Field label="Account number" htmlFor="sup-acct" hint="Your account with them">
              <Input id="sup-acct" value={v.account_number} onChange={set("account_number")} maxLength={60} />
            </Field>
            <Field label="Contact" htmlFor="sup-contact">
              <Input id="sup-contact" value={v.contact_name} onChange={set("contact_name")} maxLength={120} />
            </Field>
            <Field label="Phone" htmlFor="sup-phone">
              <Input id="sup-phone" inputMode="tel" value={v.phone} onChange={set("phone")} maxLength={40} />
            </Field>
            <Field label="Email" htmlFor="sup-email" className="sm:col-span-2" hint="Orders are sent from your own email">
              <Input id="sup-email" type="email" value={v.email} onChange={set("email")} maxLength={200} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="sup-notes">
            <Textarea id="sup-notes" rows={2} value={v.notes} onChange={set("notes")} maxLength={2000} />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            {supplier ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => save(!supplier.archived)}>
                {supplier.archived ? "Restore" : "Archive"}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PartValues = { id?: string; part_number: string; description: string; unit: string; default_unit_cost: string; supplier_id: string };

/** Add or edit a catalogue part (PRT-06). */
export function CatalogueDialog({ orgId, suppliers, part }: { orgId: string; suppliers: { value: string; label: string }[]; part?: PartValues & { archived?: boolean } }) {
  const router = useRouter();
  const empty: PartValues = { part_number: "", description: "", unit: "each", default_unit_cost: "", supplier_id: "" };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<PartValues>(part ?? empty);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const save = (archived: boolean) =>
    start(async () => {
      setError(null);
      const res = await saveCatalogueItemAction(orgId, { ...v, archived });
      if (res.status === "error") return setError(res.message);
      toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? setV(part ?? empty) : null, setError(null))}>
      <DialogTrigger asChild>
        {part ? (
          <Button size="sm" variant="ghost">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> Add part
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={part ? "Edit part" : "Add part to the catalogue"} description="Picking it on a request fills in the line.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Description" htmlFor="cat-desc" required>
            <Input id="cat-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={200} placeholder="e.g. Engine oil filter" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Part number" htmlFor="cat-pn">
              <Input id="cat-pn" value={v.part_number} onChange={(e) => setV({ ...v, part_number: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Unit" htmlFor="cat-unit">
              <Input id="cat-unit" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} maxLength={20} />
            </Field>
            <Field label="Usual price (AUD)" htmlFor="cat-cost">
              <Input id="cat-cost" inputMode="decimal" value={v.default_unit_cost} onChange={(e) => setV({ ...v, default_unit_cost: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
          </div>
          <Field label="Usual supplier" htmlFor="cat-sup">
            <SearchableSelect id="cat-sup" name="supplier_id" label="Supplier" all="None" options={suppliers} value={v.supplier_id} onChange={(x) => setV({ ...v, supplier_id: x })} />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            {part ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => save(!part.archived)}>
                {part.archived ? "Restore" : "Archive"}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save part"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
