"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProposalTerms } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { submitProposalAction } from "./actions";
import { aud } from "./labels";

const toDollars = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));
const money = (v: string) => v.replace(/[^\d.]/g, "");

/**
 * Submit or revise a proposal (MKT-09). Urgent jobs need an arrival time; standard jobs a date window.
 * The provider agrees to its connection fee when submitting.
 */
export function ProposalForm({
  providerId,
  jobId,
  urgent,
  feeCents,
  defaults,
  validityDefaultMinutes,
}: {
  providerId: string;
  jobId: string;
  urgent: boolean;
  feeCents: number;
  defaults?: ProposalTerms | null;
  validityDefaultMinutes: number;
}) {
  const router = useRouter();
  const [f, setF] = React.useState({
    price_basis: defaults?.price_basis ?? "fixed",
    amount: toDollars(defaults?.amount_cents),
    amount_max: toDollars(defaults?.amount_max_cents),
    hourly_rate: toDollars(defaults?.hourly_rate_cents),
    callout: toDollars(defaults?.callout_cents),
    gst_applies: defaults ? (defaults.gst_applies ? "yes" : "no") : "",
    available_from: defaults?.available_from ?? "",
    available_to: defaults?.available_to ?? "",
    arrival_minutes: defaults?.arrival_minutes ? String(defaults.arrival_minutes) : "",
    valid: String(validityDefaultMinutes),
    inclusions: defaults?.inclusions ?? "",
    exclusions: defaults?.exclusions ?? "",
    assumptions: defaults?.assumptions ?? "",
    note: "",
    fee_consent: false,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const validity = urgent
    ? [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: String(m), label: `${m} minutes` }))
    : [60, 180, 720, 1440, 2880, 4320, 7200, 10080, 20160].map((m) => ({ value: String(m), label: m < 1440 ? `${m / 60} hours` : `${m / 1440} days` }));
  if (!validity.some((v) => v.value === f.valid)) validity.push({ value: f.valid, label: `${f.valid} minutes` });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (f.gst_applies === "") return setError("Say whether GST applies.");
        if (!f.fee_consent) return setError("Agree to the connection fee to submit.");
        setBusy(true);
        const res = await submitProposalAction(providerId, jobId, {
          ...f,
          gst_applies: f.gst_applies === "yes",
          valid_minutes: f.valid,
          amount: f.price_basis === "hourly" ? "" : f.amount,
          amount_max: f.price_basis === "estimate" ? f.amount_max : "",
          hourly_rate: f.price_basis === "hourly" ? f.hourly_rate : "",
          callout: f.price_basis === "hourly" ? f.callout : "",
          arrival_minutes: urgent ? f.arrival_minutes : "",
          available_from: urgent ? "" : f.available_from,
          available_to: urgent ? "" : f.available_to,
        });
        setBusy(false);
        if (res.status === "error") return setError(res.message);
        toast.success(defaults ? "Proposal revised" : "Proposal submitted");
        set("fee_consent", false);
        router.refresh();
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Price basis" htmlFor="pr-basis">
          <Select id="pr-basis" value={f.price_basis} onChange={(e) => set("price_basis", e.target.value as typeof f.price_basis)}>
            <option value="fixed">Fixed price</option>
            <option value="estimate">Estimate range</option>
            <option value="hourly">Hourly rate + call-out</option>
          </Select>
        </Field>
        {f.price_basis === "hourly" ? (
          <>
            <Field label="Hourly rate ($)" htmlFor="pr-rate" required>
              <Input id="pr-rate" inputMode="decimal" value={f.hourly_rate} onChange={(e) => set("hourly_rate", money(e.target.value))} />
            </Field>
            <Field label="Call-out ($)" htmlFor="pr-callout">
              <Input id="pr-callout" inputMode="decimal" value={f.callout} onChange={(e) => set("callout", money(e.target.value))} />
            </Field>
          </>
        ) : (
          <>
            <Field label={f.price_basis === "estimate" ? "From ($)" : "Price ($)"} htmlFor="pr-amount" required>
              <Input id="pr-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", money(e.target.value))} />
            </Field>
            {f.price_basis === "estimate" ? (
              <Field label="To ($)" htmlFor="pr-max" required>
                <Input id="pr-max" inputMode="decimal" value={f.amount_max} onChange={(e) => set("amount_max", money(e.target.value))} />
              </Field>
            ) : null}
          </>
        )}
        <Field label="GST" htmlFor="pr-gst" required>
          <Select id="pr-gst" value={f.gst_applies} onChange={(e) => set("gst_applies", e.target.value)}>
            <option value="">Choose…</option>
            <option value="yes">Plus GST</option>
            <option value="no">No GST applies</option>
          </Select>
        </Field>
        {urgent ? (
          <Field label="Arrival time (minutes)" htmlFor="pr-arrive" required>
            <Input id="pr-arrive" inputMode="numeric" value={f.arrival_minutes} onChange={(e) => set("arrival_minutes", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 45" />
          </Field>
        ) : (
          <>
            <Field label="Available from" htmlFor="pr-from" required>
              <Input id="pr-from" type="date" value={f.available_from} onChange={(e) => set("available_from", e.target.value)} />
            </Field>
            <Field label="Available to" htmlFor="pr-to">
              <Input id="pr-to" type="date" value={f.available_to} onChange={(e) => set("available_to", e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Valid for" htmlFor="pr-valid">
          <Select id="pr-valid" value={f.valid} onChange={(e) => set("valid", e.target.value)}>
            {validity.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Included" htmlFor="pr-inc">
          <Textarea id="pr-inc" rows={3} value={f.inclusions} onChange={(e) => set("inclusions", e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Not included" htmlFor="pr-exc">
          <Textarea id="pr-exc" rows={3} value={f.exclusions} onChange={(e) => set("exclusions", e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Assumptions" htmlFor="pr-ass">
          <Textarea id="pr-ass" rows={3} value={f.assumptions} onChange={(e) => set("assumptions", e.target.value)} maxLength={2000} />
        </Field>
      </div>
      {defaults ? (
        <Field label="What changed?" htmlFor="pr-note" hint="Shown to the customer with this revision">
          <Input id="pr-note" value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} />
        </Field>
      ) : null}
      <label className="flex items-start gap-2.5 rounded-[10px] border border-stroke-strong p-3 text-[14px]">
        <input type="checkbox" checked={f.fee_consent} onChange={(e) => set("fee_consent", e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          I agree to pay the <strong>{aud(feeCents)}</strong> connection fee if this proposal is accepted. Nothing is charged unless the customer accepts it. The proposal is
          firm until it expires or I withdraw it.
        </span>
      </label>
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? <Loader2 className="animate-spin" /> : null} {defaults ? "Submit revision" : "Submit proposal"}
      </Button>
    </form>
  );
}
