"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Power, Truck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { createDriverAction, finishDriverAccountAction, resetDriverPinAction, setDriverActiveAction, setDriverEquipmentAction } from "./actions";

type Setup = { driverId: string; setupCode: string; expiresAt: string };

/** The one-time setup code: shown once, never stored in plain text. */
function SetupCard({ setup, expiresLabel }: { setup: Setup; expiresLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[12px] border-2 border-brand bg-[#fff7f0] p-4 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Operator ID</p>
        <p className="text-[26px] font-bold text-ink">{setup.driverId}</p>
        <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Setup code</p>
        <p className="font-mono text-[26px] font-bold tracking-[0.2em] text-brand">{setup.setupCode}</p>
        <p className="mt-1 text-[12.5px] text-ink-muted">Valid until {expiresLabel}</p>
      </div>
      <FormAlert tone="info">
        Give these to the operator now; the setup code is shown only once. They scan the QR label on a machine, enter their Operator ID and this code, and
        choose a 6-digit PIN.
      </FormAlert>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function AddDriverDialog({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setSetup(null);
      setName("");
      setPhone("");
      setError(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add operator
        </Button>
      </DialogTrigger>
      <DialogContent title={setup ? "Operator added" : "Add an operator"} description={setup ? undefined : "Operators sign in on the equipment with an Operator ID and PIN; they don't need an email address."}>
        {setup ? (
          <div className="flex flex-col gap-4">
            <SetupCard setup={setup} expiresLabel={fmt(setup.expiresAt)} />
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createDriverAction(orgId, { fullName: name, phone });
                if (res.status === "success" && res.data) {
                  setSetup(res.data);
                  router.refresh();
                } else if (res.status === "error") setError(res.message);
              });
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field label="Full name" htmlFor="dr-name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Sam Taylor" />
            </Field>
            <Field label="Mobile" htmlFor="dr-phone">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || name.trim().length < 2}>
                {pending ? "Adding…" : "Add operator"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ResetPinDialog({ orgId, driverId, label }: { orgId: string; driverId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o ? null : setSetup(null), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <KeyRound /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title="New setup code" description={setup ? undefined : "The operator's current PIN stops working. They set a new PIN with the new setup code."}>
        {setup ? (
          <div className="flex flex-col gap-4">
            <SetupCard setup={setup} expiresLabel={fmt(setup.expiresAt)} />
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await resetDriverPinAction(orgId, driverId);
                    if (res.status === "success" && res.data) {
                      setSetup(res.data);
                      router.refresh();
                    } else if (res.status === "error") setError(res.message);
                  })
                }
              >
                {pending ? "Issuing…" : "Issue new setup code"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ActiveToggle({ orgId, driverId, active }: { orgId: string; driverId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setDriverActiveAction(orgId, driverId, !active);
          if (res.status === "success") {
            toast.success(res.message ?? "Saved");
            router.refresh();
          } else if (res.status === "error") toast.error(res.message);
        })
      }
    >
      <Power /> {active ? "Deactivate" : "Re-activate"}
    </Button>
  );
}

export function FinishAccountButton({ orgId, driverId, fullName }: { orgId: string; driverId: string; fullName: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await finishDriverAccountAction(orgId, driverId, fullName);
          if (res.status === "success") router.refresh();
          else if (res.status === "error") toast.error(res.message);
        })
      }
    >
      Finish setup
    </Button>
  );
}

export function EquipmentAccessDialog({
  orgId,
  membershipId,
  name,
  equipment,
  selected,
}: {
  orgId: string;
  membershipId: string;
  name: string;
  equipment: { id: string; label: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set(selected));
  const [filter, setFilter] = React.useState("");
  const [pending, start] = React.useTransition();
  const shown = equipment.filter((e) => e.label.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setChosen(new Set(selected)))}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Truck /> Equipment ({selected.length})
        </Button>
      </DialogTrigger>
      <DialogContent title={`Equipment ${name} may operate`} description="Operators can only sign in and do pre-starts on the equipment ticked here." className="max-w-xl">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search equipment" aria-label="Search equipment" />
            <Button type="button" variant="secondary" onClick={() => setChosen(new Set(equipment.map((e) => e.id)))}>
              All
            </Button>
            <Button type="button" variant="ghost" onClick={() => setChosen(new Set())}>
              None
            </Button>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto rounded-[10px] border border-stroke">
            {shown.map((e) => (
              <li key={e.id} className="border-b border-stroke last:border-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[14px] hover:bg-surface-muted/60">
                  <input type="checkbox" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} className="size-4 accent-[var(--brand)]" />
                  {e.label}
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-3 py-3 text-[14px] text-ink-muted">No equipment found.</li> : null}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-ink-muted">{chosen.size} selected</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await setDriverEquipmentAction(orgId, membershipId, [...chosen]);
                    if (res.status === "success") {
                      toast.success(res.message ?? "Saved");
                      setOpen(false);
                      router.refresh();
                    } else if (res.status === "error") toast.error(res.message);
                  })
                }
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
