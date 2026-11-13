"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  AU_STATES,
  METER_TYPE_LABELS,
  OWNER_TYPE_LABELS,
  PRESTART_FREQUENCY_LABELS,
  SAFETY_FITTED_LABELS,
  isMobilePlantClass,
  type MeterType,
  type PrestartFrequency,
  type SafetyFittedField,
} from "@hvems/domain";
import type { AssetClass, Client, Site } from "@hvems/types";
import { assetFormSchemaFor, type AssetFormInput, type AssetFormValues } from "@hvems/validation";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { createAssetClassAction, saveAssetAction } from "./actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createServicePlanAction } from "@/features/maintenance/actions";

const NEW_CLASS = "__new__";

export function AssetForm({
  orgId,
  assetId,
  defaults,
  clients,
  sites,
  classes: initialClasses,
  canManageClasses = false,
}: {
  orgId: string;
  assetId?: string;
  defaults?: Partial<AssetFormInput>;
  clients: Client[];
  sites: Site[];
  /** Standard classes plus the company's own (O-03). */
  classes: AssetClass[];
  /** May create company classes inline (asset_classes.manage). */
  canManageClasses?: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<{ code: string; message: string } | null>(null);
  const [classes, setClasses] = React.useState(initialClasses);
  const classesRef = React.useRef(classes);
  React.useEffect(() => {
    classesRef.current = classes;
  }, [classes]);
  const form = useForm<AssetFormInput, unknown, AssetFormValues>({
    // Validates against the current class list, including classes added in this form.
    resolver: (values, context, options) => zodResolver(assetFormSchemaFor(classesRef.current))(values, context, options),
    defaultValues: { owner_type: "own", meter_type: "kilometres", asset_class: "", ...defaults },
    mode: "onTouched",
  });
  const { register, handleSubmit, control, setValue, setError, formState } = form;
  const classCode = useWatch({ control, name: "asset_class" });
  const ownerType = useWatch({ control, name: "owner_type" });
  const frequency = useWatch({ control, name: "prestart_frequency" });
  const clientId = useWatch({ control, name: "client_id" });
  const siteId = useWatch({ control, name: "site_id" });
  const cls = classes.find((c) => c.code === classCode);
  const required = new Set<string>((cls?.required_fields ?? []).filter((f) => !f.includes("|")));
  // Either-or rules, e.g. a registration or a VIN (AST-01).
  const eitherOr = (cls?.required_fields ?? []).filter((f) => f.includes("|"));
  const regoOrVin = eitherOr.some((f) => f.includes("registration_number") && f.includes("vin"));
  const err = (k: keyof AssetFormInput) => formState.errors[k]?.message as string | undefined;

  React.useEffect(() => {
    if (cls && !assetId) {
      setValue("meter_type", cls.default_meter_type as MeterType);
      // New plant starts with ROPS, FOPS and fire suppression ticked; vehicles unticked.
      const plant = isMobilePlantClass(cls);
      for (const f of Object.keys(SAFETY_FITTED_LABELS) as SafetyFittedField[]) setValue(f, plant);
    }
  }, [cls, assetId, setValue]);

  // Optional first service plan (new equipment only); saved straight after the equipment.
  const [plan, setPlan] = React.useState({ name: "", interval_days: "", interval_km: "", interval_hours: "", last_done_on: "" });
  const [planError, setPlanError] = React.useState<string | null>(null);
  const planWanted = !assetId && plan.name.trim() !== "";
  const setPlanField = (k: keyof typeof plan) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPlan((x) => ({ ...x, [k]: k === "name" || k === "last_done_on" ? e.target.value : e.target.value.replace(/[^\d.]/g, "") }));

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setPlanError(null);
    if (planWanted && !plan.interval_days && !plan.interval_km && !plan.interval_hours) {
      setPlanError("Set how often the service is due (days, km or hours), or clear the service name.");
      return;
    }
    const res = await saveAssetAction(orgId, assetId ?? null, values as AssetFormInput);
    if (res.status === "success" && res.data) {
      toast.success(res.message ?? "Saved");
      if (planWanted) {
        const p2 = await createServicePlanAction(orgId, { asset_id: res.data.id, ...plan });
        if (p2.status === "error") toast.warning(`Equipment saved, but the service plan wasn't: ${p2.message}. Add it in the Maintenance section.`);
        else toast.success("Service plan added");
      }
      router.push(`/customer/${orgId}/equipment/${res.data.id}${planWanted ? "#maintenance" : ""}`);
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
            <SearchableSelect
              id="asset_class"
              name="asset_class"
              label="Asset class"
              all="Choose a class"
              allowEmpty={false}
              invalid={!!err("asset_class")}
              value={classCode ?? ""}
              onChange={(v) => setValue("asset_class", v, { shouldValidate: true, shouldDirty: true })}
              options={[
                ...classes.map((c) => ({
                  value: c.code,
                  label: `${c.name} · ${c.organisation_id ? "your class" : c.category === "vehicle" ? "vehicle" : "equipment"}`,
                })),
                ...(canManageClasses ? [{ value: NEW_CLASS, label: "+ Add a new class…" }] : []),
              ]}
            />
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
          <Field label="Registration" htmlFor="registration_number" error={err("registration_number")} required={required.has("registration_number")} hint={regoOrVin ? "Registration or VIN: at least one" : undefined}>
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
          <Field label="VIN" htmlFor="vin" error={err("vin")} required={required.has("vin")} hint={regoOrVin ? "Registration or VIN: at least one" : undefined}>
            <Input className="uppercase" {...register("vin")} />
          </Field>
          {classCode === NEW_CLASS ? (
            <NewClassPanel
              orgId={orgId}
              onCancel={() => setValue("asset_class", "")}
              onCreated={(c) => {
                setClasses((prev) => [...prev, c]);
                classesRef.current = [...classesRef.current, c];
                // Select it once the new option has rendered.
                setTimeout(() => setValue("asset_class", c.code, { shouldValidate: true }), 0);
              }}
            />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ownership, location and usage readings" />
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
            <SearchableSelect
              id="client_id"
              name="client_id"
              label="Client"
              all="No client"
              invalid={!!err("client_id")}
              value={clientId ?? ""}
              onChange={(v) => setValue("client_id", v, { shouldValidate: true, shouldDirty: true })}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Site" htmlFor="site_id" error={err("site_id")}>
            <SearchableSelect
              id="site_id"
              name="site_id"
              label="Site"
              all="No site"
              value={siteId ?? ""}
              onChange={(v) => setValue("site_id", v, { shouldValidate: true, shouldDirty: true })}
              options={sites.map((x) => ({ value: x.id, label: x.name }))}
            />
          </Field>
          <Field
            label="What does it measure usage by?"
            htmlFor="meter_type"
            error={err("meter_type")}
            required
            hint="Trucks and vehicles usually use kilometres on the odometer; machines use hours on the hour meter. Services and pre-starts use this. You record the actual readings later, on the equipment page."
          >
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

      <Card>
        <CardHeader title="Pre-start checks" description="How often this equipment needs a pre-start." />
        <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Pre-start frequency" htmlFor="prestart_frequency">
            <Select id="prestart_frequency" {...register("prestart_frequency")}>
              <option value="">
                As per type{cls ? ` (${PRESTART_FREQUENCY_LABELS[cls.prestart_frequency as PrestartFrequency] ?? cls.prestart_frequency})` : ""}
              </option>
              {(Object.keys(PRESTART_FREQUENCY_LABELS) as PrestartFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {PRESTART_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
          {frequency === "custom" ? (
            <Field label="Every how many days?" htmlFor="prestart_every_days" error={err("prestart_every_days")} hint="2 to 365 days">
              <Input id="prestart_every_days" type="number" inputMode="numeric" min={2} max={365} {...register("prestart_every_days")} />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Safety equipment fitted"
          description="Tick what this machine has. Its pre-start then includes a check for each ticked item: mine-spec vehicles can have them too."
        />
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(Object.entries(SAFETY_FITTED_LABELS) as [SafetyFittedField, { title: string; body: string }][]).map(([f, l]) => (
            <label key={f} className="flex items-start gap-3 rounded-[10px] border border-stroke p-3">
              <input type="checkbox" {...register(f)} className="mt-0.5 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block text-[14px] font-semibold text-ink">{l.title}</span>
                <span className="block text-[13px] text-ink-muted">{l.body}</span>
              </span>
            </label>
          ))}
        </CardBody>
      </Card>

      {!assetId ? (
        <Card>
          <CardHeader title="Service plan (optional)" description="Set up its regular service now, or later in the equipment's Maintenance section." />
          <CardBody className="flex flex-col gap-4">
            {planError ? <FormAlert>{planError}</FormAlert> : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Service" htmlFor="plan_name" hint="e.g. 250-hour service, 6-monthly oil change">
                <Input id="plan_name" value={plan.name} onChange={setPlanField("name")} maxLength={120} />
              </Field>
              <Field label="Every (days)" htmlFor="plan_days" hint="e.g. 180">
                <Input id="plan_days" inputMode="numeric" value={plan.interval_days} onChange={setPlanField("interval_days")} disabled={!plan.name.trim()} />
              </Field>
              <Field label="Every (km)" htmlFor="plan_km" hint="Kilometres between services">
                <Input id="plan_km" inputMode="decimal" value={plan.interval_km} onChange={setPlanField("interval_km")} disabled={!plan.name.trim()} />
              </Field>
              <Field label="Every (hours)" htmlFor="plan_hours" hint="Hour meter hours between services">
                <Input id="plan_hours" inputMode="decimal" value={plan.interval_hours} onChange={setPlanField("interval_hours")} disabled={!plan.name.trim()} />
              </Field>
              <Field label="Last serviced on" htmlFor="plan_last" hint="Leave blank if not known; it counts from today">
                <Input id="plan_last" type="date" value={plan.last_done_on} onChange={setPlanField("last_done_on")} disabled={!plan.name.trim()} />
              </Field>
            </div>
          </CardBody>
        </Card>
      ) : null}
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

/** Inline form to create a company class; saved for the company's future equipment. */
function NewClassPanel({ orgId, onCancel, onCreated }: { orgId: string; onCancel: () => void; onCreated: (c: AssetClass) => void }) {
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<"vehicle" | "equipment">("equipment");
  const [meter, setMeter] = React.useState<MeterType>("hours");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await createAssetClassAction(orgId, { name, category, default_meter_type: meter });
      if (res.status === "success" && res.data) {
        toast.success(res.message ?? "Class added");
        onCreated(res.data);
      } else if (res.status === "error") {
        setError(res.fieldErrors?.name ?? res.message);
      }
    });
  return (
    <div className="rounded-[10px] border border-brand/40 bg-brand-soft p-4 md:col-span-2 xl:col-span-3">
      <p className="text-[14px] font-semibold text-ink">New asset class</p>
      <p className="mb-3 text-[13px] text-ink-subtle">Saved for your company, so it&apos;s available next time you add equipment.</p>
      {error ? (
        <div className="mb-3">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Class name" htmlFor="new_class_name" required>
          <Input id="new_class_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Water cart" maxLength={80} />
        </Field>
        <Field label="Category" htmlFor="new_class_category" hint="Decides mandatory fields and billing treatment.">
          <Select id="new_class_category" value={category} onChange={(e) => setCategory(e.target.value as "vehicle" | "equipment")}>
            <option value="vehicle">Vehicle (registration and VIN)</option>
            <option value="equipment">Equipment (serial number)</option>
          </Select>
        </Field>
        <Field label="Usually measured by" htmlFor="new_class_meter" hint="New equipment of this type starts with this; you can change it per piece of equipment.">
          <Select id="new_class_meter" value={meter} onChange={(e) => setMeter(e.target.value as MeterType)}>
            {Object.entries(METER_TYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending || name.trim().length < 2}>
          {pending ? "Saving…" : "Save class"}
        </Button>
      </div>
    </div>
  );
}
