"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { savePartsRequestAction } from "./actions";
import { aud } from "./status";

type Opt = { value: string; label: string };
type Catalogue = { id: string; label: string; description: string; part_number: string | null; unit: string; cost: number | null; supplier_id: string | null };
type Line = { key: string; catalogue_id: string; description: string; part_number: string; specification: string; quantity: string; unit: string; est_unit_cost: string; preferred_supplier_id: string };

const blank = (): Line => ({ key: crypto.randomUUID(), catalogue_id: "", description: "", part_number: "", specification: "", quantity: "1", unit: "each", est_unit_cost: "", preferred_supplier_id: "" });

/**
 * New parts request (PRT-01): equipment (and optionally its work order),
 * urgency, needed-by date, delivery site, and one or more lines. Picking a
 * catalogue part fills the line (PRT-06). Save as a draft or submit: within
 * your own Approval Limit it's approved straight away (PRT-02).
 */
export function PartsRequestForm({
  orgId,
  equipment,
  workOrders,
  sites,
  suppliers,
  catalogue,
  preset,
  returnTo,
}: {
  orgId: string;
  equipment: Opt[];
  workOrders: (Opt & { assetId: string })[];
  sites: Opt[];
  suppliers: Opt[];
  catalogue: Catalogue[];
  preset?: { assetId?: string; workOrderId?: string };
  returnTo?: string;
}) {
  const router = useRouter();
  const [assetId, setAssetId] = React.useState(preset?.assetId ?? "");
  const [workOrderId, setWorkOrderId] = React.useState(preset?.workOrderId ?? "");
  const [urgency, setUrgency] = React.useState<"normal" | "urgent">("normal");
  const [neededBy, setNeededBy] = React.useState("");
  const [siteId, setSiteId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([blank()]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const wos = workOrders.filter((w) => w.assetId === assetId);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.est_unit_cost) || 0), 0);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickCatalogue = (key: string, id: string) => {
    const c = catalogue.find((x) => x.id === id);
    setLine(
      key,
      c
        ? {
            catalogue_id: c.id,
            description: c.description,
            part_number: c.part_number ?? "",
            unit: c.unit,
            est_unit_cost: c.cost !== null ? (c.cost / 100).toFixed(2) : "",
            preferred_supplier_id: c.supplier_id ?? "",
          }
        : { catalogue_id: "" },
    );
  };

  const save = (submit: boolean) => {
    setError(null);
    start(async () => {
      const res = await savePartsRequestAction(orgId, {
        assetId,
        workOrderId,
        urgency,
        neededBy,
        siteId,
        notes,
        submit,
        lines: lines.map((l) => ({ ...l, key: undefined })),
      });
      if (res.status === "error") return setError(res.message);
      if (res.status === "success" && res.data) {
        toast.success(res.message ?? "Saved");
        router.push(returnTo ?? `/customer/${orgId}/parts/${res.data.id}`);
        router.refresh();
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Card>
        <CardHeader title="What it's for" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Equipment" htmlFor="pr-asset" required>
            <SearchableSelect
              id="pr-asset"
              name="asset_id"
              label="Equipment"
              all="Choose…"
              allowEmpty={false}
              options={equipment}
              value={assetId}
              onChange={(v) => {
                setAssetId(v);
                setWorkOrderId("");
              }}
            />
          </Field>
          <Field label="Work order" htmlFor="pr-wo" hint={assetId && !wos.length ? "No open work orders for this equipment" : "Optional"}>
            <SearchableSelect id="pr-wo" name="work_order_id" label="Work order" all="Not for a work order" options={wos} value={workOrderId} onChange={setWorkOrderId} />
          </Field>
          <Field label="Urgency" htmlFor="pr-urgency">
            <Select id="pr-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as "normal" | "urgent")}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Needed by" htmlFor="pr-needed">
            <Input id="pr-needed" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </Field>
          <Field label="Deliver to" htmlFor="pr-site" hint="The site the parts go to">
            <SearchableSelect id="pr-site" name="site_id" label="Site" all="No particular site" options={sites} value={siteId} onChange={setSiteId} />
          </Field>
          <Field label="Notes" htmlFor="pr-notes" className="md:col-span-2 xl:col-span-1">
            <Textarea id="pr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Parts" description="Pick from the catalogue to fill a line, or type it in." />
        <CardBody className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-[12px] border border-stroke p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink-muted">Line {i + 1}</p>
                {lines.length > 1 ? (
                  <Button type="button" size="sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {catalogue.length ? (
                  <Field label="From the catalogue" htmlFor={`cat-${l.key}`} className="col-span-2 lg:col-span-3">
                    <SearchableSelect
                      id={`cat-${l.key}`}
                      name={`catalogue_${i}`}
                      label="Catalogue part"
                      all="Not from the catalogue"
                      options={catalogue.map((c) => ({ value: c.id, label: c.label }))}
                      value={l.catalogue_id}
                      onChange={(v) => pickCatalogue(l.key, v)}
                    />
                  </Field>
                ) : null}
                <Field label="Description" htmlFor={`d-${l.key}`} required className={cn("col-span-2", catalogue.length ? "lg:col-span-3" : "lg:col-span-4")}>
                  <Input id={`d-${l.key}`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} maxLength={200} />
                </Field>
                <Field label="Part number" htmlFor={`pn-${l.key}`} className={cn(catalogue.length ? "" : "lg:col-span-2")}>
                  <Input id={`pn-${l.key}`} value={l.part_number} onChange={(e) => setLine(l.key, { part_number: e.target.value })} maxLength={80} />
                </Field>
                <Field label="Quantity" htmlFor={`q-${l.key}`} required>
                  <Input id={`q-${l.key}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })} />
                </Field>
                <Field label="Unit" htmlFor={`u-${l.key}`}>
                  <Input id={`u-${l.key}`} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} maxLength={20} placeholder="each, L, m" />
                </Field>
                <Field label="Estimated price each (AUD)" htmlFor={`c-${l.key}`} required>
                  <Input id={`c-${l.key}`} inputMode="decimal" value={l.est_unit_cost} onChange={(e) => setLine(l.key, { est_unit_cost: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 120.00" />
                </Field>
                <Field label="Preferred supplier" htmlFor={`s-${l.key}`} className="col-span-2">
                  <SearchableSelect
                    id={`s-${l.key}`}
                    name={`supplier_${i}`}
                    label="Supplier"
                    all="No preference"
                    options={suppliers}
                    value={l.preferred_supplier_id}
                    onChange={(v) => setLine(l.key, { preferred_supplier_id: v })}
                  />
                </Field>
                <Field label="Specification" htmlFor={`sp-${l.key}`} className="col-span-2 lg:col-span-6">
                  <Input id={`sp-${l.key}`} value={l.specification} onChange={(e) => setLine(l.key, { specification: e.target.value })} maxLength={1000} placeholder="Size, rating, fitting, colour…" />
                </Field>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blank()])} disabled={lines.length >= 50}>
              <Plus /> Add another part
            </Button>
            <p className="text-[14px] text-ink-muted">
              Estimated total <span className="font-semibold text-ink">{aud(Math.round(total * 100))}</span>
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
