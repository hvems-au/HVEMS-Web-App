"use client";
import * as React from "react";
import type { MeterType } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { FormAlert, Input } from "@/components/ui/form";
import { recordReadingsAction, type ReadingsResult } from "../actions";

type Unit = "km" | "hours";
const UNIT = {
  km: { label: "Odometer", suffix: "km", noun: "odometer", example: "e.g. 125400" },
  hours: { label: "Hour meter", suffix: "hours", noun: "hour meter", example: "e.g. 5230.5" },
} as const;

/**
 * Odometer on the left, hour meter on the right, each with its own box. Fill in
 * one or both; each is saved as its own reading with its own request id, so a
 * retry never records twice. A unit the asset doesn't track yet can be started
 * by manager roles only (canAddMeter), with an explicit tick.
 */
export function MeterForm({
  orgId,
  assetId,
  meterType,
  canAddMeter = false,
  last = {},
}: {
  orgId: string;
  assetId: string;
  meterType: MeterType;
  canAddMeter?: boolean;
  /** Current accepted readings: a lower value asks for a reason straight away. */
  last?: Partial<Record<Unit, number | null>>;
}) {
  const [ids, setIds] = React.useState(() => ({ km: crypto.randomUUID(), hours: crypto.randomUUID() }));
  const [values, setValues] = React.useState<Record<Unit, string>>({ km: "", hours: "" });
  const [state, action, pending] = React.useActionState(async (prev: ReadingsResult, form: FormData) => {
    const res = await recordReadingsAction(orgId, assetId, prev, form);
    // Units that were saved get a fresh request id and an empty box; a unit that
    // needs attention keeps its value and id, so trying again is safe.
    const done = res.status === "idle" ? [] : res.recorded;
    if (done.length) {
      setIds((cur) => ({ km: done.includes("km") ? crypto.randomUUID() : cur.km, hours: done.includes("hours") ? crypto.randomUUID() : cur.hours }));
      setValues((cur) => ({ km: done.includes("km") ? "" : cur.km, hours: done.includes("hours") ? "" : cur.hours }));
    }
    return res;
  }, { status: "idle" } as ReadingsResult);

  const tracked = (u: Unit) => meterType === "both" || (u === "km" ? meterType === "kilometres" : meterType === "hours");
  const failedUnit = state.status === "error" ? state.unit : undefined;
  const followUp = (u: Unit) => (failedUnit === u && state.status === "error" ? state.code : null);

  const column = (u: Unit) => {
    const meta = UNIT[u];
    const on = tracked(u);
    const disabled = !on && !canAddMeter;
    const code = followUp(u);
    const typed = values[u] === "" ? null : Number(values[u]);
    const lastValue = last[u] ?? null;
    const lower = on && typed !== null && Number.isFinite(typed) && lastValue !== null && typed < lastValue;
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`reading-${u}`} className="text-[13px] font-medium text-ink">
          {meta.label} <span className="font-normal text-ink-muted">({meta.suffix})</span>
        </label>
        <Input
          id={`reading-${u}`}
          name={`value_${u}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder={meta.example}
          disabled={disabled}
          value={values[u]}
          onChange={(e) => setValues((cur) => ({ ...cur, [u]: e.target.value.replace(/[^\d.]/g, "") }))}
          aria-invalid={failedUnit === u || undefined}
        />
        <input type="hidden" name={`client_request_id_${u}`} value={ids[u]} />
        {!on ? (
          canAddMeter ? (
            <label className="flex items-start gap-2 text-[12.5px] text-ink-muted">
              <input type="checkbox" name={`add_meter_${u}`} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>Start recording the {meta.noun} for this equipment</span>
            </label>
          ) : (
            <p className="text-[12.5px] text-ink-muted">Not recorded for this equipment.</p>
          )
        ) : null}
        {lastValue !== null && on ? <p className="text-[12px] text-ink-subtle">Last: {lastValue.toLocaleString("en-AU")} {meta.suffix}</p> : null}
        {lower || code === "lower_reading_reason_required" ? (
          <div className="flex flex-col gap-1 rounded-[8px] border border-warn-line bg-warn-soft p-2.5">
            <p className="text-[12.5px] font-medium text-warn-ink">Lower than the last reading. Say why; a manager approves it before it counts.</p>
            <Input name={`lower_reason_${u}`} placeholder="e.g. Instrument cluster replaced" aria-label={`Reason for a lower ${meta.noun} reading`} required autoFocus={code === "lower_reading_reason_required"} />
          </div>
        ) : null}
        {code === "implausible_jump_confirmation_required" ? (
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-warn-ink">
            <input type="checkbox" name={`confirm_jump_${u}`} className="size-4 accent-[var(--brand)]" /> Yes, this reading is correct
          </label>
        ) : null}
      </div>
    );
  };

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-stroke pt-4">
      {state.status === "error" ? (
        <FormAlert>
          {failedUnit ? `${UNIT[failedUnit].label}: ` : ""}
          {state.message}
        </FormAlert>
      ) : null}
      {state.status === "success" ? <FormAlert tone="success">{state.message}</FormAlert> : null}
      <div className="grid grid-cols-2 gap-3">
        {column("km")}
        {column("hours")}
      </div>
      <Button type="submit" variant="outline" disabled={pending || (!values.km.trim() && !values.hours.trim())}>
        {pending ? "Saving…" : "Record reading"}
      </Button>
    </form>
  );
}
