"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fuel, Loader2, Pencil } from "lucide-react";
import { INSPECTION_PHOTO_BUCKET, inspectionPhotoPath } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordFuelAction } from "./actions";

export const FUEL_TYPES = { diesel: "Diesel", unleaded: "Unleaded", adblue: "AdBlue", lpg: "LPG", oil: "Oil", other: "Other" } as const;
export type FuelTypeKey = keyof typeof FUEL_TYPES;

export type FuelEquipment = {
  value: string;
  label: string;
  meterType: "none" | "kilometres" | "hours" | "both";
  lastKm: number | null;
  lastHours: number | null;
};

export type FuelAmend = {
  id: string;
  assetId: string;
  filledAt: string; // yyyy-mm-ddThh:mm (local)
  fuelType: FuelTypeKey;
  quantity: number;
  unit: "L" | "kg" | "each";
  supplier: string | null;
  notes: string | null;
};

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * Record a fuel fill, or correct one (amend). The odometer / hour meter reading
 * is recorded on the equipment; a lower one asks for a reason straight away.
 * Costs are entered only by people who can see costs (showCost).
 */
export function FuelDialog({
  orgId,
  equipment,
  showCost,
  amend,
  fixedAssetId,
}: {
  orgId: string;
  equipment: FuelEquipment[];
  showCost: boolean;
  amend?: FuelAmend;
  fixedAssetId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [requestId, setRequestId] = React.useState(() => crypto.randomUUID());
  const [assetId, setAssetId] = React.useState(amend?.assetId ?? fixedAssetId ?? "");
  const [filledAt, setFilledAt] = React.useState(amend?.filledAt ?? "");
  const [fuelType, setFuelType] = React.useState<FuelTypeKey>(amend?.fuelType ?? "diesel");
  const [unit, setUnit] = React.useState<"L" | "kg" | "each">(amend?.unit ?? "L");
  const [quantity, setQuantity] = React.useState(amend ? String(amend.quantity) : "");
  const [cost, setCost] = React.useState("");
  const [gst, setGst] = React.useState(true);
  const [supplier, setSupplier] = React.useState(amend?.supplier ?? "");
  const [km, setKm] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [lowerReason, setLowerReason] = React.useState("");
  const [confirmJump, setConfirmJump] = React.useState(false);
  const [needJump, setNeedJump] = React.useState(false);
  const [notes, setNotes] = React.useState(amend?.notes ?? "");
  const [amendReason, setAmendReason] = React.useState("");
  const [receipts, setReceipts] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const eq = equipment.find((e) => e.value === assetId);
  const tracksKm = eq ? eq.meterType === "kilometres" || eq.meterType === "both" : false;
  const tracksHours = eq ? eq.meterType === "hours" || eq.meterType === "both" : false;
  const lower =
    (km !== "" && eq?.lastKm != null && Number(km) < eq.lastKm) || (hours !== "" && eq?.lastHours != null && Number(hours) < eq.lastHours);

  async function addReceipt(files: FileList | null) {
    if (!files?.length || !assetId) return;
    setUploading(true);
    const db = getSupabaseBrowserClient();
    for (const file of Array.from(files).slice(0, 3 - receipts.length)) {
      const path = inspectionPhotoPath(orgId, assetId, `fuel-${requestId}`, file.name);
      const { error: e } = await db.storage.from(INSPECTION_PHOTO_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (e) toast.error("A receipt photo didn't upload. Use a JPEG, PNG or HEIC photo up to 10 MB.");
      else setReceipts((r) => [...r, path]);
    }
    setUploading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
        if (o && !filledAt) setFilledAt(nowLocal());
      }}
    >
      <DialogTrigger asChild>
        {amend ? (
          <Button size="sm" variant="ghost" aria-label="Correct this fuel record" className="relative z-10">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Fuel /> Record fuel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={amend ? "Correct a fuel record" : "Record fuel"}
        description={amend ? "The original is kept in the history and its cost is reversed." : "Quantity, odometer or hour meter reading, and the receipt."}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!assetId) return setError("Choose the equipment.");
            if (lower && !lowerReason.trim() && !amend) return setError("The reading is lower than the last one. Say why.");
            setBusy(true);
            const res = await recordFuelAction(orgId, {
              assetId,
              // The browser knows the user's local time; send an exact instant.
              filledAt: filledAt ? new Date(filledAt).toISOString() : "",
              quantity,
              fuelType,
              unit,
              cost: showCost ? cost : "",
              gstIncluded: gst,
              supplier,
              odometerKm: amend ? "" : km,
              engineHours: amend ? "" : hours,
              lowerReason,
              confirmJump,
              receiptPaths: receipts,
              notes,
              clientRequestId: requestId,
              amendsId: amend?.id ?? "",
              amendReason,
            });
            setBusy(false);
            if (res.status === "error") {
              if (res.code === "implausible_jump_confirmation_required") setNeedJump(true);
              return setError(res.message);
            }
            toast.success(res.status === "success" && res.message ? res.message : "Saved");
            setOpen(false);
            setRequestId(crypto.randomUUID());
            setQuantity("");
            setCost("");
            setKm("");
            setHours("");
            setLowerReason("");
            setReceipts([]);
            setNeedJump(false);
            setConfirmJump(false);
            setFilledAt("");
            router.refresh();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          {!amend && !fixedAssetId ? (
            <Field label="Equipment" htmlFor="fuel-asset" required>
              <SearchableSelect
                id="fuel-asset"
                name="asset"
                label="Equipment"
                all="Choose equipment…"
                allowEmpty={false}
                value={assetId}
                options={equipment.map(({ value, label }) => ({ value, label }))}
                onChange={(v) => (setAssetId(v), setReceipts([]))}
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date and time" htmlFor="fuel-at" required>
              <Input id="fuel-at" type="datetime-local" value={filledAt} onChange={(e) => setFilledAt(e.target.value)} required />
            </Field>
            <Field label="Fuel" htmlFor="fuel-type">
              <Select id="fuel-type" value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelTypeKey)}>
                {(Object.keys(FUEL_TYPES) as FuelTypeKey[]).map((k) => (
                  <option key={k} value={k}>
                    {FUEL_TYPES[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" htmlFor="fuel-qty" required>
              <div className="flex gap-2">
                <Input id="fuel-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} required />
                <Select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as "L" | "kg" | "each")} className="w-24">
                  <option value="L">litres</option>
                  <option value="kg">kg</option>
                  <option value="each">each</option>
                </Select>
              </div>
            </Field>
            <Field label="Supplier" htmlFor="fuel-supplier">
              <Input id="fuel-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={160} placeholder="e.g. Ampol Caboolture" />
            </Field>
            {showCost ? (
              <Field label="Cost (AUD)" htmlFor="fuel-cost" hint="Optional">
                <Input id="fuel-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 245.00" />
                <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
                  <input type="checkbox" checked={gst} onChange={(e) => setGst(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Includes GST
                </label>
              </Field>
            ) : null}
          </div>
          {!amend && eq && (tracksKm || tracksHours) ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tracksKm ? (
                <Field label="Odometer (km)" htmlFor="fuel-km" hint={eq.lastKm != null ? `Last: ${eq.lastKm.toLocaleString("en-AU")} km` : undefined}>
                  <Input id="fuel-km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ""))} />
                </Field>
              ) : null}
              {tracksHours ? (
                <Field label="Hour meter (hours)" htmlFor="fuel-hours" hint={eq.lastHours != null ? `Last: ${eq.lastHours.toLocaleString("en-AU")} hours` : undefined}>
                  <Input id="fuel-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
                </Field>
              ) : null}
            </div>
          ) : null}
          {!amend && lower ? (
            <div className="flex flex-col gap-1 rounded-[8px] border border-warn-line bg-warn-soft p-2.5">
              <p className="text-[12.5px] font-medium text-warn-ink">Lower than the last reading. Say why; a manager approves it before it counts.</p>
              <Input value={lowerReason} onChange={(e) => setLowerReason(e.target.value)} placeholder="e.g. Instrument cluster replaced" aria-label="Reason for a lower reading" />
            </div>
          ) : null}
          {needJump ? (
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-warn-ink">
              <input type="checkbox" checked={confirmJump} onChange={(e) => setConfirmJump(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Yes, this reading is correct
            </label>
          ) : null}
          {!amend ? (
            <Field label="Receipt photo" htmlFor="fuel-receipt" hint={receipts.length ? `${receipts.length} added` : "Optional, up to 3"}>
              <Input
                id="fuel-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                disabled={!assetId || uploading || receipts.length >= 3}
                onChange={(e) => addReceipt(e.target.files)}
                className="h-auto py-2"
              />
            </Field>
          ) : null}
          {amend ? (
            <Field label="Why is it being corrected?" htmlFor="fuel-amend" required>
              <Input id="fuel-amend" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} maxLength={500} required />
            </Field>
          ) : (
            <Field label="Notes" htmlFor="fuel-notes">
              <Textarea id="fuel-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy || uploading}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" /> Saving…
                </>
              ) : amend ? (
                "Save correction"
              ) : (
                "Record fuel"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
