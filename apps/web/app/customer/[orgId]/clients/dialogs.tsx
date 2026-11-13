"use client";
import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AU_STATES } from "@hvems/domain";
import type { Client, Site } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { TimezoneSelect } from "@/components/timezone-select";
import { createClientAction, createSiteAction, updateClientAction, updateSiteAction } from "./actions";

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

type DialogState = ReturnType<typeof useDialogAction>;

function FormError({ d }: { d: DialogState }) {
  return d.state.status === "error" && d.state.code !== "invalid" ? (
    <div className="sm:col-span-2">
      <FormAlert>{d.state.message}</FormAlert>
    </div>
  ) : null;
}

function EditTrigger({ label }: { label: string }) {
  return (
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" aria-label={label}>
        <Pencil /> Edit
      </Button>
    </DialogTrigger>
  );
}

// ------------------------------------------------------------------ clients
function ClientFields({ d, client }: { d: DialogState; client?: Client }) {
  return (
    <>
      <FormError d={d} />
      <Field label="Client name" htmlFor="c-name" error={d.fe("name")} required className="sm:col-span-2">
        <Input id="c-name" name="name" defaultValue={client?.name ?? ""} placeholder="e.g. Bayside Civil Pty Ltd" />
      </Field>
      <Field label="ABN" htmlFor="c-abn" error={d.fe("abn")}>
        <Input id="c-abn" name="abn" inputMode="numeric" defaultValue={client?.abn ?? ""} placeholder="11 digits" />
      </Field>
      <Field label="Contact name" htmlFor="c-contact" error={d.fe("contact_name")}>
        <Input id="c-contact" name="contact_name" defaultValue={client?.contact_name ?? ""} />
      </Field>
      <Field label="Contact email" htmlFor="c-email" error={d.fe("contact_email")}>
        <Input id="c-email" name="contact_email" type="email" defaultValue={client?.contact_email ?? ""} placeholder="name@client.com.au" />
      </Field>
      <Field label="Contact phone" htmlFor="c-phone" error={d.fe("contact_phone")}>
        <Input id="c-phone" name="contact_phone" type="tel" defaultValue={client?.contact_phone ?? ""} />
      </Field>
      <Field label="Address" htmlFor="c-address" error={d.fe("address")} className="sm:col-span-2">
        <Input id="c-address" name="address" defaultValue={client?.address ?? ""} />
      </Field>
    </>
  );
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
          <ClientFields d={d} />
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

export function EditClientDialog({ orgId, client }: { orgId: string; client: Client }) {
  const d = useDialogAction(updateClientAction.bind(null, orgId, client.id));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <EditTrigger label={`Edit ${client.name}`} />
      <DialogContent title="Edit client" description="Changes are recorded in your company's audit history.">
        {/* key resets the fields to the saved values each time the dialog opens */}
        <form key={String(d.open)} action={d.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ClientFields d={d} client={client} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => d.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={d.pending}>
              {d.pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ sites
function SiteFields({ d, clients, site }: { d: DialogState; clients: Client[]; site?: Site }) {
  return (
    <>
      <FormError d={d} />
      <Field label="Site name" htmlFor="s-name" error={d.fe("name")} required>
        <Input id="s-name" name="name" defaultValue={site?.name ?? ""} placeholder="e.g. Brendale depot" />
      </Field>
      <Field label="Client" htmlFor="s-client" error={d.fe("client_id")}>
        <Select id="s-client" name="client_id" defaultValue={site?.client_id ?? ""}>
          <option value="">Our own site</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Address" htmlFor="s-addr" error={d.fe("address_line1")} className="sm:col-span-2">
        <Input id="s-addr" name="address_line1" autoComplete="street-address" defaultValue={site?.address_line1 ?? ""} />
      </Field>
      <Field label="Suburb" htmlFor="s-suburb" error={d.fe("suburb")}>
        <Input id="s-suburb" name="suburb" defaultValue={site?.suburb ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" htmlFor="s-state" error={d.fe("state")}>
          <Select id="s-state" name="state" defaultValue={site ? (site.state ?? "") : "QLD"}>
            <option value="">—</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Postcode" htmlFor="s-postcode" error={d.fe("postcode")}>
          <Input id="s-postcode" name="postcode" inputMode="numeric" maxLength={4} defaultValue={site?.postcode ?? ""} />
        </Field>
      </div>
      <Field label="Timezone" htmlFor="s-tz" error={d.fe("timezone")} hint="Used for this site's due dates and inspection days.">
        <TimezoneSelect id="s-tz" value={site?.timezone} />
      </Field>
      <Field label="Contact name" htmlFor="s-contact" error={d.fe("contact_name")}>
        <Input id="s-contact" name="contact_name" defaultValue={site?.contact_name ?? ""} />
      </Field>
      <Field label="Contact phone" htmlFor="s-phone" error={d.fe("contact_phone")}>
        <Input id="s-phone" name="contact_phone" type="tel" defaultValue={site?.contact_phone ?? ""} />
      </Field>
      <Field label="Access instructions" htmlFor="s-access" error={d.fe("access_instructions")} className="sm:col-span-2">
        <Textarea id="s-access" name="access_instructions" rows={2} defaultValue={site?.access_instructions ?? ""} />
      </Field>
      <Field label="Safety instructions" htmlFor="s-safety" error={d.fe("safety_instructions")} className="sm:col-span-2">
        <Textarea id="s-safety" name="safety_instructions" rows={2} defaultValue={site?.safety_instructions ?? ""} />
      </Field>
    </>
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
          <SiteFields d={d} clients={clients} />
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

export function EditSiteDialog({ orgId, clients, site }: { orgId: string; clients: Client[]; site: Site }) {
  const d = useDialogAction(updateSiteAction.bind(null, orgId, site.id));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <EditTrigger label={`Edit ${site.name}`} />
      <DialogContent title="Edit site" description="A timezone change affects this site's future due dates and inspection days." className="max-w-2xl">
        <form key={String(d.open)} action={d.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SiteFields d={d} clients={clients} site={site} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => d.setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={d.pending}>
              {d.pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
