"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ASSET_CLASSES, AU_STATES, METER_TYPE_LABELS, OWNER_TYPE_LABELS, type MeterType } from "@hvems/domain";
import type { Client, Site } from "@hvems/types";
import { assetFormSchema, type AssetFormInput, type AssetFormValues } from "@hvems/validation";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { saveAssetAction } from "./actions";

export function AssetForm({
  orgId,
  assetId,
  defaults,
  clients,
  sites,
}: {
  orgId: string;
  assetId?: string;
  defaults?: Partial<AssetFormInput>;
  clients: Client[];
  sites: Site[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<{ code: string; message: string } | null>(null);
  const form = useForm<AssetFormInput, unknown, AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: { owner_type: "own", meter_type: "kilometres", asset_class: "", ...defaults },
    mode: "onTouched",
  });
  const { register, handleSubmit, control, setValue, setError, formState } = form;
  const classCode = useWatch({ control, name: "asset_class" });
  const ownerType = useWatch({ control, name: "owner_type" });
  const cls = ASSET_CLASSES.find((c) => c.code === classCode);
  const required = new Set<string>(cls?.requiredFields ?? []);
  const err = (k: keyof AssetFormInput) => formState.errors[k]?.message as string | undefined;

  React.useEffect(() => {
    if (cls && !assetId) setValue("meter_type", cls.defaultMeterType as MeterType);
  }, [cls, assetId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await saveAssetAction(orgId, assetId ?? null, values as AssetFormInput);
    if (res.status === "success" && res.data) {
      toast.success(res.message ?? "Saved");
      router.push(`/customer/${orgId}/equipment/${res.data.id}`);
      router.refresh();
      return;
    }
    if (res.status === "error") {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof AssetFormInput, { message: v });
      setServerError({ code: res.code, message: res.message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError ? (
        <FormAlert>
          {serverError.message}
          {serverError.code === "duplicate_needs_reason" || formState.errors.vin || formState.errors.serial_number || formState.errors.registration_number
            ? " If this is intentional, give a reason in “Duplicate reason”."
            : null}
        </FormAlert>
      ) : null}
      <Card>
        <CardHeader title="Identification" description="Mandatory fields depend on the asset class." />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Asset number" htmlFor="asset_number" error={err("asset_number")} required hint="Your own fleet number, e.g. EQ-1268">
            <Input {...register("asset_number")} />
          </Field>
          <Field label="Asset class" htmlFor="asset_class" error={err("asset_class")} required>
            <Select {...register("asset_class")}>
              <option value="">Choose a class</option>
              <optgroup label="Vehicles">
                {ASSET_CLASSES.filter((c) => c.category === "vehicle").map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Equipment">
                {ASSET_CLASSES.filter((c) => c.category === "equipment").map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="Year" htmlFor="year" error={err("year")}>
            <Input inputMode="numeric" maxLength={4} {...register("year")} />
          </Field>
          <Field label="Make" htmlFor="make" error={err("make")} required={required.has("make")}>
            <Input {...register("make")} />
          </Field>
          <Field label="Model" htmlFor="model" error={err("model")} required={required.has("model")}>
            <Input {...register("model")} />
          </Field>
          <Field label="Serial number" htmlFor="serial_number" error={err("serial_number")} required={required.has("serial_number")}>
            <Input {...register("serial_number")} />
          </Field>
          <Field label="Registration" htmlFor="registration_number" error={err("registration_number")} required={required.has("registration_number")}>
            <Input className="uppercase" {...register("registration_number")} />
          </Field>
          <Field label="State or territory" htmlFor="registration_state" error={err("registration_state")} required={required.has("registration_state")}>
            <Select {...register("registration_state")}>
              <option value="">—</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="VIN" htmlFor="vin" error={err("vin")} required={required.has("vin")}>
            <Input className="uppercase" {...register("vin")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ownership, location and meter" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Owner type" htmlFor="owner_type" error={err("owner_type")} required>
            <Select {...register("owner_type")}>
              {Object.entries(OWNER_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Client" htmlFor="client_id" error={err("client_id")} required={ownerType === "client_owned"} hint={clients.length === 0 ? "Add clients under Clients & Sites." : undefined}>
            <Select {...register("client_id")}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Site" htmlFor="site_id" error={err("site_id")}>
            <Select {...register("site_id")}>
              <option value="">No site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Meter type" htmlFor="meter_type" error={err("meter_type")} required hint="Readings are recorded on the equipment page.">
            <Select {...register("meter_type")}>
              {Object.entries(METER_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duplicate reason" htmlFor="duplicate_reason" error={err("duplicate_reason")} hint="Only needed if another current asset has the same VIN, serial or registration.">
            <Input {...register("duplicate_reason")} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={err("notes")} className="md:col-span-2 xl:col-span-3">
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : assetId ? "Save changes" : "Add equipment"}
        </Button>
      </div>
    </form>
  );
}
