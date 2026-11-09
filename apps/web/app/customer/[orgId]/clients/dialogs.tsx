"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AU_STATES } from "@hvems/domain";
import type { Client } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { createClientAction, createSiteAction } from "./actions";

function useDialogAction(action: (prev: ClientActionState, form: FormData) => Promise<ClientActionState>) {
  const [open, setOpen] = React.useState(false);
  const [state, run, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await action(prev, form);
    if (res.status === "success") {
      toast.success(res.message ?? "Saved");
      setOpen(false);
    }
    return res;
  }, idleState);
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return { open, setOpen, state, run, pending, fe };
}

export function NewClientDialog({ orgId }: { orgId: string }) {
  const d = useDialogAction(createClientAction.bind(null, orgId));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add client
        </Button>
      </DialogTrigger>
      <DialogContent title="Add client" description="Client records are private to your company and never create a login.">
        <form action={d.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.state.status === "error" && d.state.code !== "invalid" ? (
            <div className="sm:col-span-2">
              <FormAlert>{d.state.message}</FormAlert>
            </div>
          ) : null}
          <Field label="Client name" htmlFor="c-name" error={d.fe("name")} required className="sm:col-span-2">
            <Input name="name" />
          </Field>
          <Field label="ABN" htmlFor="c-abn" error={d.fe("abn")}>
            <Input name="abn" inputMode="numeric" />
          </Field>
          <Field label="Contact name" htmlFor="c-contact" error={d.fe("contact_name")}>
            <Input name="contact_name" />
          </Field>
          <Field label="Contact email" htmlFor="c-email" error={d.fe("contact_email")}>
            <Input name="contact_email" type="email" />
          </Field>
          <Field label="Contact phone" htmlFor="c-phone" error={d.fe("contact_phone")}>
            <Input name="contact_phone" type="tel" />
          </Field>
          <Field label="Address" htmlFor="c-address" error={d.fe("address")} className="sm:col-span-2">
            <Input name="address" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={d.pending}>
              {d.pending ? "Saving…" : "Add client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewSiteDialog({ orgId, clients }: { orgId: string; clients: Client[] }) {
  const d = useDialogAction(createSiteAction.bind(null, orgId));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Add site
        </Button>
      </DialogTrigger>
      <DialogContent title="Add site" description="Sites hold the address, timezone, contacts, shift times and access and safety instructions." className="max-w-2xl">
        <form action={d.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.state.status === "error" && d.state.code !== "invalid" ? (
            <div className="sm:col-span-2">
              <FormAlert>{d.state.message}</FormAlert>
            </div>
          ) : null}
          <Field label="Site name" htmlFor="s-name" error={d.fe("name")} required>
            <Input name="name" />
          </Field>
          <Field label="Client" htmlFor="s-client" error={d.fe("client_id")}>
            <Select name="client_id" defaultValue="">
              <option value="">Our own site</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address" htmlFor="s-addr" error={d.fe("address_line1")} className="sm:col-span-2">
            <Input name="address_line1" autoComplete="street-address" />
          </Field>
          <Field label="Suburb" htmlFor="s-suburb" error={d.fe("suburb")}>
            <Input name="suburb" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State" htmlFor="s-state" error={d.fe("state")}>
              <Select name="state" defaultValue="QLD">
                <option value="">—</option>
                {AU_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Postcode" htmlFor="s-postcode" error={d.fe("postcode")}>
              <Input name="postcode" inputMode="numeric" maxLength={4} />
            </Field>
          </div>
          <Field label="Timezone" htmlFor="s-tz" error={d.fe("timezone")} hint="Used for this site's due dates and inspection days.">
            <Select name="timezone" defaultValue="Australia/Brisbane">
              {["Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth"].map((t) => (
                <option key={t} value={t}>
                  {t.replace("Australia/", "")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact name" htmlFor="s-contact" error={d.fe("contact_name")}>
            <Input name="contact_name" />
          </Field>
          <Field label="Contact phone" htmlFor="s-phone" error={d.fe("contact_phone")}>
            <Input name="contact_phone" type="tel" />
          </Field>
          <Field label="Shift times" htmlFor="s-shift" error={d.fe("shift_times")}>
            <Input name="shift_times" placeholder="e.g. Day 06:00–18:00, Night 18:00–06:00" />
          </Field>
          <Field label="Access instructions" htmlFor="s-access" error={d.fe("access_instructions")} className="sm:col-span-2">
            <Textarea name="access_instructions" rows={2} />
          </Field>
          <Field label="Safety instructions" htmlFor="s-safety" error={d.fe("safety_instructions")} className="sm:col-span-2">
            <Textarea name="safety_instructions" rows={2} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={d.pending}>
              {d.pending ? "Saving…" : "Add site"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
