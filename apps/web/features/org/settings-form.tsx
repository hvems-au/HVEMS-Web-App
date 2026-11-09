"use client";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { idleState } from "@/lib/client-state";
import { updateOrganisationAction } from "./actions";

interface OrgSettings {
  id: string;
  kind: string;
  name: string;
  legal_name: string;
  abn: string;
  overdue: boolean;
  repairer: boolean;
}

function Toggle({ name, defaultChecked, disabled, title, body }: { name: string; defaultChecked: boolean; disabled: boolean; title: string; body: string }) {
  return (
    <label className="flex items-start gap-3 rounded-[10px] border border-stroke p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5 size-5 accent-[var(--brand)]" />
      <span>
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="block text-[13px] text-ink-muted">{body}</span>
      </span>
    </label>
  );
}

export function SettingsForm({ portal, org, editable }: { portal: string; org: OrgSettings; editable: boolean }) {
  const [state, action, pending] = React.useActionState(updateOrganisationAction.bind(null, portal, org.id), idleState);
  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "Saved");
  }, [state]);
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      <input type="hidden" name="kind" value={org.kind} />
      {!editable ? <FormAlert tone="info">You can view these settings. Owners and Administrators can change them.</FormAlert> : null}
      {state.status === "error" && state.code !== "invalid" ? <FormAlert>{state.message}</FormAlert> : null}
      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={fe("name")} required>
            <Input name="name" defaultValue={org.name} disabled={!editable} />
          </Field>
          <Field label="Legal name" htmlFor="legal_name">
            <Input name="legal_name" defaultValue={org.legal_name} disabled={!editable} />
          </Field>
          <Field label="ABN" htmlFor="abn" error={fe("abn")} required={org.kind === "provider"}>
            <Input name="abn" defaultValue={org.abn} inputMode="numeric" disabled={!editable} />
          </Field>
        </CardBody>
      </Card>
      {org.kind === "company" ? (
        <Card>
          <CardHeader title="Company safety rules" description="Optional rules each company can switch on (SoW §3.4)." />
          <CardBody className="flex flex-col gap-3">
            <Toggle
              name="overdue_service_sets_needs_attention"
              defaultChecked={org.overdue}
              disabled={!editable}
              title="Overdue services set “Needs attention”"
              body="When on, an overdue service makes the asset Needs attention until it is serviced."
            />
            <Toggle
              name="repairer_cannot_clear_own_critical"
              defaultChecked={org.repairer}
              disabled={!editable}
              title="Repairers can't clear their own Critical repairs"
              body="When on, the person who repaired a Critical defect can't also clear it."
            />
          </CardBody>
        </Card>
      ) : null}
      {editable ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
