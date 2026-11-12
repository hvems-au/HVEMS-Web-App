"use client";
import * as React from "react";
import type { MeterType } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { recordMeterReadingAction } from "../actions";

/** Records a reading. A fresh client_request_id per attempt makes retries idempotent. */
/**
 * Both units are always offered. Recording the unit the asset doesn't track yet
 * needs an explicit tick by a manager role (canAddMeter); the asset then tracks both.
 */
export function MeterForm({ orgId, assetId, meterType, canAddMeter = false }: { orgId: string; assetId: string; meterType: MeterType; canAddMeter?: boolean }) {
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

  const tracked = (u: "km" | "hours") => meterType === "both" || (u === "km" ? meterType === "kilometres" : meterType === "hours");
  const units = (["km", "hours"] as const).slice().sort((a, b) => Number(tracked(b)) - Number(tracked(a)));
  const [unit, setUnit] = React.useState<"km" | "hours">(units[0] ?? "km");
  const untracked = !tracked(unit);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 border-t border-stroke pt-4">
      <input type="hidden" name="client_request_id" value={requestId} />
      {state.status === "error" && !needsReason && !needsConfirm ? <FormAlert>{state.message}</FormAlert> : null}
      {state.status === "success" ? <FormAlert tone="success">{state.message}</FormAlert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reading" htmlFor="unit">
          <Select name="unit" value={unit} onChange={(e) => setUnit(e.target.value as "km" | "hours")}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u === "km" ? "Odometer (km)" : "Hour meter (hours)"}
                {tracked(u) ? "" : " (not tracked yet)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Value" htmlFor="value" error={state.status === "error" ? state.fieldErrors?.value : undefined}>
          <Input name="value" inputMode="decimal" required />
        </Field>
      </div>
      {untracked ? (
        canAddMeter ? (
          <label className="flex items-start gap-2 rounded-[6px] border border-stroke bg-surface-muted p-3 text-[13.5px] text-ink">
            <input type="checkbox" name="add_meter" required className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>
              Also record {unit === "km" ? "odometer" : "hour meter"} readings for this asset.
              <span className="block text-[12.5px] text-ink-subtle">It will then record {meterType === "none" ? (unit === "km" ? "the odometer" : "the hour meter") : "both the odometer and the hour meter"}. The change is recorded in the audit history.</span>
            </span>
          </label>
        ) : (
          <FormAlert tone="info">This asset doesn&apos;t record {unit === "km" ? "odometer" : "hour meter"} readings yet. Ask a Fleet Manager or Company Admin to start tracking it.</FormAlert>
        )
      ) : null}
      {needsReason ? (
        <Field label="Reason for a lower reading" htmlFor="lower_reason" error={state.message}>
          <Input name="lower_reason" placeholder="e.g. Odometer or hour meter replaced" required />
        </Field>
      ) : null}
      {needsConfirm ? (
        <div className="rounded-[6px] border border-warn-line bg-warn-soft p-3 text-[13.5px] text-warn-ink">
          <p>{state.message}</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" name="confirm_jump" className="size-4 accent-[var(--brand)]" /> Yes, this reading is correct
          </label>
        </div>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending || (untracked && !canAddMeter)}>
        {pending ? "Saving…" : "Record reading"}
      </Button>
    </form>
  );
}
