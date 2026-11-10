import type { Metadata } from "next";
import { formatDriverId, listDrivers } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActiveToggle, AddDriverDialog, EquipmentAccessDialog, FinishAccountButton, ResetPinDialog } from "./driver-controls";

export const metadata: Metadata = { title: "Drivers" };

function nowMs() {
  return Date.now();
}

/**
 * Driver profiles (O-10): Driver ID + PIN sign-in on the equipment, no email.
 * Driver profiles are unlimited and don't count towards member logins.
 */
export default async function DriversPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "drivers.manage");
  const db = await createSupabaseServerClient();
  const [drivers, assets, perms] = await Promise.all([
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
  ]);
  const equipment = assets.map((a) => ({ id: a.id, label: `${a.asset_number}${a.make || a.model ? ` · ${[a.make, a.model].filter(Boolean).join(" ")}` : ""}` }));
  const permsByMember = new Map<string, string[]>();
  for (const p of perms.data ?? []) permsByMember.set(p.membership_id as string, [...(permsByMember.get(p.membership_id as string) ?? []), p.asset_id as string]);
  const tz = ctx.timezone;
  const now = nowMs();

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Drivers sign in on the equipment with a Driver ID and 6-digit PIN. Driver profiles are unlimited."
        actions={<AddDriverDialog orgId={orgId} />}
      />
      <Card>
        {drivers.length === 0 ? (
          <EmptyState title="No drivers yet">Add a driver to get a Driver ID and a one-time setup code. Then choose the equipment they may operate.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Driver ID</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {drivers.map((d) => {
                const locked = d.locked_until && new Date(d.locked_until).getTime() > now;
                const waiting = !!d.setup_expires_at;
                const expired = waiting && new Date(d.setup_expires_at!).getTime() < now;
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
