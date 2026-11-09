"use client";
import * as React from "react";
import { toast } from "sonner";
import type { Organisation } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { setSuspendedAction, updateOrganisationAction } from "./actions";

const TIMEZONES = ["Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth"];

function useToastAction(action: (prev: ClientActionState, form: FormData) => Promise<ClientActionState>, onSuccess?: () => void) {
  const [state, run, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await action(prev, form);
    if (res.status === "success") {
      toast.success(res.message ?? "Saved");
      onSuccess?.();
    }
    return res;
  }, idleState);
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return { state, run, pending, fe };
}

export function OrganisationDetailsForm({ org, canEdit }: { org: Organisation; canEdit: boolean }) {
  const a = useToastAction(updateOrganisationAction.bind(null, org.id));
  const locked = !canEdit || org.status === "closed" || org.status === "closing";
  return (
    <form action={a.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {a.state.status === "error" && a.state.code !== "invalid" ? (
        <div className="sm:col-span-2">
          <FormAlert>{a.state.message}</FormAlert>
        </div>
      ) : null}
      <fieldset disabled={locked} className="contents">
        <Field label="Name" htmlFor="o-name" error={a.fe("name")} required>
          <Input id="o-name" name="name" defaultValue={org.name} placeholder="Trading name" />
        </Field>
        <Field label="Legal name" htmlFor="o-legal" error={a.fe("legal_name")}>
          <Input id="o-legal" name="legal_name" defaultValue={org.legal_name ?? ""} placeholder="e.g. Example Haulage Pty Ltd" />
        </Field>
        <Field
          label="ABN"
          htmlFor="o-abn"
          error={a.fe("abn")}
          required={org.kind === "provider"}
          hint={org.kind === "provider" ? "Required for providers." : "Optional."}
        >
          <Input id="o-abn" name="abn" inputMode="numeric" defaultValue={org.abn ?? ""} placeholder="11 digits" />
        </Field>
        <Field label="Timezone" htmlFor="o-tz" error={a.fe("timezone")}>
          <Select id="o-tz" name="timezone" defaultValue={org.timezone}>
            {(TIMEZONES.includes(org.timezone) ? TIMEZONES : [org.timezone, ...TIMEZONES]).map((t) => (
              <option key={t} value={t}>
                {t.replace("Australia/", "")}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>
      {canEdit ? (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={a.pending || locked}>
            {a.pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-subtle sm:col-span-2">Only a Super Admin can change organisation details.</p>
      )}
    </form>
  );
}

export function SuspensionForm({ org }: { org: Organisation }) {
  const suspended = org.status === "suspended";
  const formRef = React.useRef<HTMLFormElement>(null);
  const a = useToastAction(setSuspendedAction.bind(null, org.id), () => formRef.current?.reset());
  return (
    <form ref={formRef} action={a.run} className="flex flex-col gap-4">
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      {a.state.status === "error" && a.state.code !== "invalid" ? <FormAlert>{a.state.message}</FormAlert> : null}
      <Field
        label={suspended ? "Reason for reinstating" : "Reason for de-activating"}
        htmlFor="o-reason"
        error={a.fe("reason")}
        required
        hint="Recorded in the audit history of the organisation and the platform."
      >
        <Textarea
          id="o-reason"
          name="reason"
          rows={3}
          placeholder={suspended ? "e.g. Issue resolved with the Owner on 12/11/2026" : "e.g. Breach of the terms of use: …"}
        />
      </Field>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant={suspended ? "primary" : "danger"}
          disabled={a.pending}
          onClick={(e) => {
            if (!suspended && !window.confirm(`De-activate ${org.name}? Its members can still sign in for safety records, but can't add equipment or members.`)) {
              e.preventDefault();
            }
          }}
        >
          {a.pending ? "Saving…" : suspended ? "Reinstate organisation" : "De-activate organisation"}
        </Button>
      </div>
    </form>
  );
}
