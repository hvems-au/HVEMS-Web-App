"use client";
import * as React from "react";
import { Building2, Store, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { idleState } from "@/lib/client-state";
import { cn } from "@/lib/utils";
import { createOrganisationAction } from "./actions";

const KINDS = [
  {
    value: "company",
    icon: Building2,
    title: "Company organisation",
    body: "Manage your fleet: equipment, inspections, defects, maintenance, workforce, and post marketplace jobs. First five assets free.",
    nameLabel: "Company name",
  },
  {
    value: "marketplace_customer",
    icon: Store,
    title: "Marketplace-only customer",
    body: "Just need a breakdown, urgent repair or a service? Post jobs and engage verified providers. No fleet subscription.",
    nameLabel: "Account name (your name or business)",
  },
  {
    value: "provider",
    icon: Wrench,
    title: "Service provider",
    body: "Independent technicians, mobile mechanics and workshops: get verified, find jobs and submit proposals.",
    nameLabel: "Business name",
  },
] as const;

/** `kinds` are the account types this portal creates (ADR-009); one kind hides the chooser. */
export function OnboardingForm({ kinds }: { kinds: readonly string[] }) {
  const [state, action, pending] = React.useActionState(createOrganisationAction, idleState);
  const offered = KINDS.filter((k) => kinds.includes(k.value));
  const [kind, setKind] = React.useState<string>(offered[0]?.value ?? "company");
  const current = offered.find((k) => k.value === kind) ?? offered[0] ?? KINDS[0];
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      {offered.length === 1 ? (
        <input type="hidden" name="kind" value={current.value} />
      ) : (
      <fieldset>
        <legend className="mb-3 text-[14px] font-medium text-ink-muted">What would you like to set up?</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {offered.map((k) => (
            <label
              key={k.value}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-[12px] border-2 bg-white p-4 transition-colors",
                kind === k.value ? "border-brand shadow-sm" : "border-stroke hover:border-ink-subtle",
              )}
            >
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
              <span className={cn("flex size-10 items-center justify-center rounded-[8px]", kind === k.value ? "bg-brand text-white" : "bg-surface-muted text-ink-muted")}>
                <k.icon className="size-5" aria-hidden />
              </span>
              <span className="text-[15px] font-semibold text-ink">{k.title}</span>
              <span className="text-[13px] leading-snug text-ink-muted">{k.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={current.nameLabel} htmlFor="name" error={fe("name")} required>
          <Input name="name" autoComplete="organization" />
        </Field>
        <Field
          label="ABN"
          htmlFor="abn"
          error={fe("abn")}
          required={kind === "provider"}
          hint={kind === "provider" ? "Checked by HVEMS during verification." : "Optional."}
        >
          <Input name="abn" inputMode="numeric" placeholder="11 digits" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
