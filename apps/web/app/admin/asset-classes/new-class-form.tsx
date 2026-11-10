"use client";
import * as React from "react";
import { toast } from "sonner";
import { METER_TYPE_LABELS } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { createStandardClassAction } from "./actions";

export function NewStandardClassForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, run, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await createStandardClassAction(prev, form);
    if (res.status === "success") {
      toast.success(res.message ?? "Class added");
      formRef.current?.reset();
    }
    return res;
  }, idleState);
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <form ref={formRef} action={run} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      {state.status === "error" && state.code !== "invalid" ? (
        <div className="md:col-span-4">
          <FormAlert>{state.message}</FormAlert>
        </div>
      ) : null}
      <Field label="Class name" htmlFor="sc-name" error={fe("name")} required>
        <Input id="sc-name" name="name" placeholder="e.g. Crane truck" maxLength={80} />
      </Field>
      <Field label="Category" htmlFor="sc-category" error={fe("category")}>
        <Select id="sc-category" name="category" defaultValue="vehicle">
          <option value="vehicle">Vehicle (registration and VIN)</option>
          <option value="equipment">Equipment (serial number)</option>
        </Select>
      </Field>
      <Field label="Odometer / hour meter" htmlFor="sc-meter" error={fe("default_meter_type")}>
        <Select id="sc-meter" name="default_meter_type" defaultValue="kilometres">
          {Object.entries(METER_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add standard class"}
      </Button>
    </form>
  );
}
