"use client";
import * as React from "react";
import { toast } from "sonner";
import type { Organisation } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { TimezoneSelect } from "@/components/timezone-select";
import { SignInLock } from "@/components/sign-in-lock";
import { adminResetUserMfaAction, adminUnlockSignInAction, endSupportAccessAction, setSuspendedAction, startSupportAccessAction, updateOrganisationAction } from "./actions";
import { confirmDialog, promptDialog } from "@/components/ui/confirm";

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
          <TimezoneSelect key={org.timezone} id="o-tz" value={org.timezone} />
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
          onClick={async (e) => {
            if (suspended) return;
            e.preventDefault();
            const form = e.currentTarget.form;
            const ok = await confirmDialog({
              title: `De-activate ${org.name}?`,
              description: "Its members can still sign in for safety records, but can't add equipment or members.",
              confirmLabel: "De-activate",
              danger: true,
            });
            if (ok) form?.requestSubmit();
          }}
        >
          {a.pending ? "Saving…" : suspended ? "Reinstate organisation" : "De-activate organisation"}
        </Button>
      </div>
    </form>
  );
}

/** Super Admin: reset someone's MFA after confirming who they are (ACC-15). */
export function ResetMfaButton({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        const reason = await promptDialog({
          title: `Reset multi-factor authentication for ${name}?`,
          description: "Their authenticator app and recovery codes stop working, and they set up a new one at their next sign-in.",
          input: { label: "How did you confirm who they are?", hint: "At least 10 characters", required: true },
          confirmLabel: "Reset MFA",
          danger: true,
        });
        if (!reason) return;
        start(async () => {
          const res = await adminResetUserMfaAction(orgId, userId, reason);
          if (res.status === "success") toast.success(res.message ?? "Done");
          else if (res.status === "error") toast.error(res.message);
        });
      }}
    >
      Reset MFA
    </Button>
  );
}

/** Super Admin: clear someone's wrong passwords or sign-in lock (O-11). */
export function AdminSignInLock(props: { orgId: string; userId: string; name: string; failedCount: number; lockedUntilText: string | null }) {
  const { orgId, userId, ...rest } = props;
  return <SignInLock {...rest} unlock={() => adminUnlockSignInAction(orgId, userId)} />;
}

/**
 * Support access for this organisation (ADM-07): read-only, at most 60 minutes,
 * with a reason. The company's Owner is notified and can end it.
 */
export function SupportAccessCard({
  orgId,
  active,
  maxMinutes,
  directAccess,
}: {
  orgId: string;
  active: { id: string; untilText: string; reason: string } | null;
  maxMinutes: number;
  /** The Super Admin already sees team and fleet (O-05). */
  directAccess: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [minutes, setMinutes] = React.useState(Math.min(30, maxMinutes));
  const [pin, setPin] = React.useState("");
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<ClientActionState>) =>
    start(async () => {
      const res = await fn();
      if (res.status === "success") toast.success(res.message ?? "Done");
      else if (res.status === "error") toast.error(res.message);
    });
  if (active) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-info/40 bg-info-soft px-4 py-3 text-[13.5px]">
        <span className="font-semibold text-info-ink">Support access active until {active.untilText}</span>
        <span className="text-ink-muted">Read-only · {active.reason}</span>
        <Button size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={() => run(() => endSupportAccessAction(orgId, active.id))}>
          End now
        </Button>
      </div>
    );
  }
  return (
    <form
      className="mb-5 flex flex-wrap items-end gap-3 rounded-[10px] border border-stroke bg-surface px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => startSupportAccessAction(orgId, reason, minutes, pin));
      }}
    >
      <div className="min-w-[260px] flex-1">
        <Field label={directAccess ? "Support access (read-only, for working on a customer request)" : "Support access (needed to see team and fleet records)"} htmlFor="sa-reason">
          <Input id="sa-reason" placeholder="Reason, e.g. ticket 1234: help with the import file" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </div>
      <Field label="Minutes" htmlFor="sa-minutes">
        <select
          id="sa-minutes"
          className="h-10 rounded-[6px] border border-stroke bg-surface px-2 text-[14px]"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        >
          {[15, 30, 45, 60].filter((m) => m <= maxMinutes).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Company's support PIN" htmlFor="sa-pin" hint="The Owner or Company Admin reads it from Settings → Security">
        <Input
          id="sa-pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          className="w-32 text-center font-mono tracking-[0.3em]"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Button type="submit" disabled={pending || reason.trim().length < 10 || pin.length !== 6}>
        {pending ? "Starting…" : "Start support access"}
      </Button>
    </form>
  );
}
