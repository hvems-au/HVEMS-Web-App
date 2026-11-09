"use client";
import * as React from "react";
import type { MeterType } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { recordMeterReadingAction } from "../actions";

/** Records a reading. A fresh client_request_id per attempt makes retries idempotent. */
export function MeterForm({ orgId, assetId, meterType }: { orgId: string; assetId: string; meterType: MeterType }) {
  const [requestId, setRequestId] = React.useState(() => crypto.randomUUID());
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await recordMeterReadingAction(orgId, assetId, prev, form);
    if (res.status === "success") {
      formRef.current?.reset();
      setRequestId(crypto.randomUUID());
    }
    return res;
  }, idleState);
  const needsReason = state.status === "error" && state.code === "lower_reading_reason_required";
  const needsConfirm = state.status === "error" && state.code === "implausible_jump_confirmation_required";

  const units = meterType === "both" ? (["km", "hours"] as const) : meterType === "hours" ? (["hours"] as const) : (["km"] as const);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 border-t border-stroke pt-4">
      <input type="hidden" name="client_request_id" value={requestId} />
      {state.status === "error" && !needsReason && !needsConfirm ? <FormAlert>{state.message}</FormAlert> : null}
      {state.status === "success" ? <FormAlert tone="success">{state.message}</FormAlert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meter" htmlFor="unit">
          <Select name="unit" defaultValue={units[0]}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u === "km" ? "Odometer (km)" : "Engine hours"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reading" htmlFor="value" error={state.status === "error" ? state.fieldErrors?.value : undefined}>
          <Input name="value" inputMode="decimal" required />
        </Field>
      </div>
      {needsReason ? (
        <Field label="Reason for a lower reading" htmlFor="lower_reason" error={state.message}>
          <Input name="lower_reason" placeholder="e.g. Odometer replaced" required />
        </Field>
      ) : null}
      {needsConfirm ? (
        <div className="rounded-[6px] border border-[#f0b46b] bg-warn-soft p-3 text-[13.5px] text-[#8a4300]">
          <p>{state.message}</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" name="confirm_jump" className="size-4 accent-[var(--brand)]" /> Yes, this reading is correct
          </label>
        </div>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Record reading"}
      </Button>
    </form>
  );
}
