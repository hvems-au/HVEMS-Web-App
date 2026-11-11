"use client";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { changePasswordAction } from "./actions";

/** Change password, for every signed-in user (Account security). */
export function ChangePasswordCard() {
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();

  if (!open) {
    return (
      <section className="mt-6 flex items-center justify-between gap-3 border-t border-stroke pt-5">
        <div>
          <h2 className="font-semibold text-ink">Password</h2>
          <p className="text-[13px] text-ink-muted">Change the password you sign in with.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change password
        </Button>
      </section>
    );
  }

  return (
    <form
      className="mt-6 flex flex-col gap-4 border-t border-stroke pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFieldErrors({});
        start(async () => {
          const res = await changePasswordAction({ current, password, confirmPassword: confirm });
          if (res.status === "success") {
            toast.success(res.message ?? "Password changed");
            setCurrent("");
            setPassword("");
            setConfirm("");
            setOpen(false);
          } else if (res.status === "error") {
            setError(res.message);
            setFieldErrors(res.fieldErrors ?? {});
          }
        });
      }}
    >
      <h2 className="font-semibold text-ink">Change password</h2>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Current password" htmlFor="pw-current" error={fieldErrors.current} required>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" htmlFor="pw-new" error={fieldErrors.password} hint="At least 10 characters." required>
        <Input id="pw-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm" error={fieldErrors.confirmPassword} required>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
