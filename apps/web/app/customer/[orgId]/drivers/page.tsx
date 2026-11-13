import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
import { cn, firstParam } from "@/lib/utils";
import { formatDriverId, listDriverCredentials, listDrivers } from "@hvems/api-client";
import { credentialStatus, credentialTitle, formatDateTimeAU, todayISO } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CredentialsDialog, type CredentialRow } from "./credentials-dialog";
import { OperatorAccessCard } from "@/features/operator/access-card";
import { portalOrigin } from "@/lib/portals";
import { ActiveToggle, AddDriverDialog, EditDriverDialog, EquipmentAccessDialog, FinishAccountButton, ResetPinDialog } from "./driver-controls";

export const metadata: Metadata = { title: "Operators" };

function nowMs() {
  return Date.now();
}

/**
 * Operator profiles (O-10): Operator ID + PIN sign-in on the equipment, no email.
 * Operator profiles are unlimited and don't count towards member logins.
 */
export default async function DriversPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const q = (firstParam((await searchParams).q) ?? "").trim().slice(0, 60);
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "drivers.manage");
  const db = await createSupabaseServerClient();
  const [drivers, assets, perms, credentials, warnSetting, orgRow] = await Promise.all([
    listDrivers(db, orgId),
    db
      .from("assets")
      .select("id, asset_number, make, model")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("asset_number")
      .limit(2000)
      .then((r) => (r.data ?? []) as { id: string; asset_number: string; make: string | null; model: string | null }[]),
    db.from("asset_operator_permissions").select("membership_id, asset_id").eq("organisation_id", orgId).not("asset_id", "is", null),
    listDriverCredentials(db, orgId),
    db.from("platform_settings").select("value").eq("key", "drivers.credential_warning_days").maybeSingle(),
    db.from("organisations").select("operator_code, operators_any_equipment").eq("id", orgId).maybeSingle(),
  ]);
  const access = orgRow.data as { operator_code: string | null; operators_any_equipment: boolean } | null;
  const equipment = assets.map((a) => ({ id: a.id, label: `${a.asset_number}${a.make || a.model ? ` · ${[a.make, a.model].filter(Boolean).join(" ")}` : ""}` }));
  const permsByMember = new Map<string, string[]>();
  for (const p of perms.data ?? []) permsByMember.set(p.membership_id as string, [...(permsByMember.get(p.membership_id as string) ?? []), p.asset_id as string]);
  const tz = ctx.timezone;
  const now = nowMs();
  const today = todayISO(tz);
  const warningDays = Number(warnSetting.data?.value) || 30;
  const dmy = (iso: string) => iso.split("-").reverse().join("/");
  // Search (as you type): name, Operator ID (OP-0001 or just 1), or phone.
  const needle = q.toLowerCase().replace(/\s+/g, "");
  const shown = drivers.filter((d) => {
    if (!needle) return true;
    const id = formatDriverId(d.driver_number).toLowerCase();
    return (
      d.full_name.toLowerCase().replace(/\s+/g, "").includes(needle) ||
      id.includes(needle) ||
      String(d.driver_number) === needle.replace(/^(op|d)-?0*/, "") ||
      (d.phone ?? "").replace(/\s+/g, "").includes(needle)
    );
  });
  const credsByDriver = new Map<string, CredentialRow[]>();
  for (const cr of credentials) {
    const row: CredentialRow = { ...cr, status: credentialStatus(cr.expires_on, today, warningDays), expiresText: cr.expires_on ? dmy(cr.expires_on) : null };
    credsByDriver.set(cr.driver_id, [...(credsByDriver.get(cr.driver_id) ?? []), row]);
  }

  return (
    <>
      <PageHeader
        title="Operators"
        description="Operators sign in on the equipment with an Operator ID and PIN."
        actions={<AddDriverDialog orgId={orgId} />}
      />
      <OperatorAccessCard
        orgId={orgId}
        companyCode={access?.operator_code ?? null}
        anyEquipment={access?.operators_any_equipment ?? true}
        signInUrl={`${portalOrigin("company").replace(/^https?:\/\//, "")}/driver`}
      />
      <Card>
        {drivers.length ? (
          <AutoFilterForm className="flex flex-wrap items-center gap-3 border-b border-stroke p-4">
            <span className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Name, Operator ID or phone"
                aria-label="Search operators"
                autoComplete="off"
                enterKeyHint="search"
                className={cn("h-10 pl-9 text-[13.5px]", SEARCH_FIELD)}
              />
            </span>
            {q ? (
              <p className="text-[13px] text-ink-muted" aria-live="polite">
                {shown.length} of {drivers.length} match ·{" "}
                <Link href={`/customer/${orgId}/drivers`} className="font-medium text-link hover:underline">
                  Clear
                </Link>
              </p>
            ) : null}
          </AutoFilterForm>
        ) : null}
        {drivers.length === 0 ? (
          <EmptyState title="No operators yet">Add an operator to get an Operator ID and a one-time setup code. Then choose the equipment they may operate.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="No operators match">Try part of the name, the Operator ID (e.g. OP-0002) or a phone number.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Operator ID</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Credentials</TH>
                <TH>Last sign-in</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {shown.map((d) => {
                const locked = d.locked_until && new Date(d.locked_until).getTime() > now;
                const waiting = !!d.setup_expires_at;
                const expired = waiting && new Date(d.setup_expires_at!).getTime() < now;
                const creds = credsByDriver.get(d.id) ?? [];
                const flagged = creds.filter((cr) => cr.status === "expired" || cr.status === "expiring");
                return (
                  <TR key={d.id}>
                    <TD className="font-mono font-semibold">{formatDriverId(d.driver_number)}</TD>
                    <TD>
                      <span className="font-medium">{d.full_name}</span>
                      {d.phone ? <span className="block text-[12.5px] text-ink-subtle">{d.phone}</span> : null}
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1.5">
                        {!d.active ? (
                          <Badge tone="grey">Deactivated</Badge>
                        ) : locked ? (
                          <Badge tone="red">Locked</Badge>
                        ) : waiting ? (
                          <Badge tone={expired ? "red" : "amber"}>{expired ? "Setup code expired" : "Waiting for PIN setup"}</Badge>
                        ) : (
                          <Badge tone="green">Active</Badge>
                        )}
                        {!d.user_id ? <Badge tone="red">Login not set up</Badge> : null}
                      </span>
                    </TD>
                    <TD>
                      {creds.length === 0 ? (
                        <span className="text-ink-subtle">None recorded</span>
                      ) : flagged.length === 0 ? (
                        <Badge tone="green">{creds.length} current</Badge>
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          {flagged.map((cr) => (
                            <Badge key={cr.id} tone={cr.status === "expired" ? "red" : "amber"}>
                              {credentialTitle(cr)} {cr.status === "expired" ? "expired" : "expires"} {cr.expiresText}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{d.last_sign_in_at ? formatDateTimeAU(new Date(d.last_sign_in_at), tz) : "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-2">
                        {!d.user_id ? (
                          <FinishAccountButton orgId={orgId} driverId={d.id} fullName={d.full_name} />
                        ) : (
                          <>
                            {d.membership_id ? (
                              <EquipmentAccessDialog
                                orgId={orgId}
                                membershipId={d.membership_id}
                                name={d.full_name}
                                equipment={equipment}
                                selected={permsByMember.get(d.membership_id) ?? []}
                              />
                            ) : null}
                            {d.active ? <ResetPinDialog orgId={orgId} driverId={d.id} label={waiting || locked ? "New setup code" : "Reset PIN"} /> : null}
                          </>
                        )}
                        <EditDriverDialog orgId={orgId} driverId={d.id} fullName={d.full_name} phone={d.phone} />
                        <CredentialsDialog orgId={orgId} driverId={d.id} name={d.full_name} credentials={creds} />
                        <ActiveToggle orgId={orgId} driverId={d.id} active={d.active} />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
