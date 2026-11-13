"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import type { MemberGrant, MemberRole } from "@hvems/permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { confirmDialog, promptDialog } from "@/components/ui/confirm";
import {
  assignGrantAction,
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  resetMemberMfaAction,
  revokeGrantAction,
  revokeInvitationAction,
  setAdditionalRolesAction,
} from "./actions";

type Opt<T extends string = string> = { value: T; label: string };

function notify(res: ClientActionState) {
  if (res.status === "success") toast.success(res.message ?? "Done");
  else if (res.status === "error") toast.error(res.message);
}

export function InviteDialog({ portal, orgId, roles }: { portal: string; orgId: string; roles: Opt<MemberRole>[] }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(inviteMemberAction.bind(null, portal, orgId), idleState as ClientActionState<{ link: string }>);
  const link = state.status === "success" ? state.data?.link : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite a member" description="The person signs in (or signs up) with this email address to accept.">
        {link ? (
          <div className="flex flex-col gap-3">
            <FormAlert tone="success">{state.status === "success" ? state.message : null}</FormAlert>
            <p className="text-[13.5px] text-ink-muted">
              Invitation emails are sent once HVEMS&apos;s email sending domain is connected (increment 2D). Until then, share this one-time link
              with the person securely:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-[12px]" aria-label="Invitation link" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success("Link copied");
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            {state.status === "error" && state.code !== "invalid" ? <FormAlert>{state.message}</FormAlert> : null}
            <Field label="Email address" htmlFor="inv-email" error={state.status === "error" ? state.fieldErrors?.email : undefined} required>
              <Input name="email" type="email" autoComplete="off" />
            </Field>
            <Field label="Role" htmlFor="inv-role" required>
              <Select name="role" defaultValue={roles[0]?.value}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create invitation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeInvitationButton({ portal, orgId, invitationId }: { portal: string; orgId: string; invitationId: string }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          notify(await revokeInvitationAction(portal, orgId, invitationId));
          router.refresh();
        })
      }
    >
      Revoke
    </Button>
  );
}

/** Tick the extra roles a member also holds; they get the permissions of every role. */
function AdditionalRolesDialog({
  portal,
  orgId,
  membershipId,
  name,
  mainRole,
  options,
  current,
  open,
  onOpenChange,
}: {
  portal: string;
  orgId: string;
  membershipId: string;
  name: string;
  mainRole: string;
  options: Opt<MemberRole>[];
  current: MemberRole[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [chosen, setChosen] = React.useState<MemberRole[]>(current);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setChosen(current);
          setError(null);
        }
      }}
    >
      <DialogContent title={"Roles for " + name} description={"Main role: " + mainRole + ". Tick any other roles they also hold; they get the permissions of every role. Changes are recorded."}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await setAdditionalRolesAction(portal, orgId, membershipId, chosen);
              if (res.status === "error") return setError(res.message);
              notify(res);
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1.5 text-[13px] font-medium text-ink">Also holds</legend>
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2.5 rounded-[8px] px-2 py-2 text-[14px] text-ink hover:bg-surface-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--brand)]"
                  checked={chosen.includes(o.value)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.value] : c.filter((r) => r !== o.value)))}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save roles"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({
  portal,
  orgId,
  membershipId,
  name,
  grants,
  open,
  onOpenChange,
}: {
  portal: string;
  orgId: string;
  membershipId: string;
  name: string;
  grants: Opt<MemberGrant>[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [state, action, pending] = React.useActionState(async (prev: ClientActionState, form: FormData) => {
    const res = await assignGrantAction(portal, orgId, membershipId, prev, form);
    if (res.status === "success") {
      notify(res);
      onOpenChange(false);
    }
    return res;
  }, idleState);
  const [grant, setGrant] = React.useState<MemberGrant | undefined>(grants[0]?.value);
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Assign a grant to ${name}`} description="Grants give a named member extra authority. Each assignment is recorded in the audit history.">
        <form action={action} className="flex flex-col gap-4">
          {state.status === "error" && state.code !== "invalid" ? <FormAlert>{state.message}</FormAlert> : null}
          <Field label="Grant" htmlFor="grant">
            <Select name="grant" value={grant} onChange={(e) => setGrant(e.target.value as MemberGrant)}>
              {grants.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          {grant === "clearance_authority" ? (
            <>
              <p className="rounded-[6px] bg-surface-muted p-3 text-[13px] text-ink-muted">
                Clearance Authority allows clearing Critical defects, returning assets to service, lowering a severity, dismissing a Critical report,
                deferring a Minor defect and removing an Out of service hold. Choosing a competent person is the company&apos;s responsibility.
              </p>
              <Field label="Competency note" htmlFor="competency_note" error={fe("competency_note")} required hint="Training, qualification or experience.">
                <Textarea name="competency_note" rows={3} />
              </Field>
            </>
          ) : null}
          {grant === "approval_limit" ? (
            <Field label="Approval limit (AUD)" htmlFor="approval_limit" error={fe("approval_limit")} required>
              <Input name="approval_limit" inputMode="decimal" placeholder="e.g. 2500" />
            </Field>
          ) : null}
          {grant === "marketplace_buyer" ? (
            <p className="rounded-[6px] bg-surface-muted p-3 text-[13px] text-ink-muted">
              Marketplace Buyers can post jobs and accept proposals, which incurs connection fees ($29 standard, $49 urgent).
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Assign grant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberActions({
  portal,
  orgId,
  membershipId,
  name,
  role,
  additionalRoles,
  operatorProfile = false,
  roles,
  grants,
  assignable,
}: {
  portal: string;
  orgId: string;
  membershipId: string;
  name: string;
  role: MemberRole;
  additionalRoles: MemberRole[];
  /** Operator ID accounts only operate equipment, so they don't take other roles. */
  operatorProfile?: boolean;
  roles: Opt<MemberRole>[];
  grants: { id: string; label: string }[];
  assignable: Opt<MemberGrant>[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [rolesOpen, setRolesOpen] = React.useState(false);
  const run = (fn: () => Promise<ClientActionState>) =>
    start(async () => {
      notify(await fn());
      router.refresh();
    });

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="z-50 w-60 rounded-[10px] border border-stroke bg-surface p-1.5 text-[13px] shadow-xl">
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted">Change role</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="z-50 w-52 rounded-[10px] border border-stroke bg-surface p-1.5 shadow-xl">
                  {roles
                    .filter((r) => r.value !== role)
                    .map((r) => (
                      <DropdownMenu.Item
                        key={r.value}
                        className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted"
                        onSelect={() => run(() => changeRoleAction(portal, orgId, membershipId, r.value))}
                      >
                        {r.label}
                      </DropdownMenu.Item>
                    ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            {operatorProfile ? null : (
              <DropdownMenu.Item className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted" onSelect={() => setRolesOpen(true)}>
                Additional roles…
              </DropdownMenu.Item>
            )}
            {assignable.length ? (
              <DropdownMenu.Item className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted" onSelect={() => setGrantOpen(true)}>
                Assign grant…
              </DropdownMenu.Item>
            ) : null}
            {grants.map((g) => (
              <DropdownMenu.Item
                key={g.id}
                className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted"
                onSelect={async () => {
                  const reason = await promptDialog({
                    title: `Revoke ${g.label} from ${name}?`,
                    input: { label: "Reason", required: true },
                    confirmLabel: "Revoke",
                    danger: true,
                  });
                  if (reason) run(() => revokeGrantAction(portal, orgId, g.id, reason));
                }}
              >
                Revoke {g.label}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item
              className="rounded-md px-2 py-2 outline-none data-[highlighted]:bg-surface-muted"
              onSelect={async () => {
                const reason = await promptDialog({
                  title: `Reset multi-factor authentication for ${name}?`,
                  description: "Their authenticator app and recovery codes stop working, and they set up a new one at their next sign-in.",
                  input: { label: "Reason", hint: 'For example "lost phone"', required: true },
                  confirmLabel: "Reset MFA",
                  danger: true,
                });
                if (reason) run(() => resetMemberMfaAction(portal, orgId, membershipId, reason));
              }}
            >
              Reset MFA…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-stroke" />
            <DropdownMenu.Item
              className="rounded-md px-2 py-2 text-danger outline-none data-[highlighted]:bg-danger-soft"
              onSelect={async () => {
                if (await confirmDialog({ title: `Remove ${name}?`, description: "Their records and history are kept.", confirmLabel: "Remove member", danger: true }))
                  run(() => removeMemberAction(portal, orgId, membershipId));
              }}
            >
              Remove member
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {assignable.length ? (
        <GrantDialog portal={portal} orgId={orgId} membershipId={membershipId} name={name} grants={assignable} open={grantOpen} onOpenChange={setGrantOpen} />
      ) : null}
      {operatorProfile ? null : (
        <AdditionalRolesDialog
          portal={portal}
          orgId={orgId}
          membershipId={membershipId}
          name={name}
          mainRole={roles.find((r) => r.value === role)?.label ?? role}
          options={roles.filter((r) => r.value !== role)}
          current={additionalRoles}
          open={rolesOpen}
          onOpenChange={setRolesOpen}
        />
      )}
    </>
  );
}
