"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { openCodeAction } from "./actions";

export function CodeForm() {
  const [state, action, pending] = React.useActionState(openCodeAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Field label="Equipment code" htmlFor="code" hint="The 10 characters printed under the QR label, e.g. ABCD-EFGH-JK">
        <Input name="code" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH-JK" className="font-mono text-[18px] tracking-widest uppercase" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Opening…" : "Continue"}
      </Button>
    </form>
  );
}
