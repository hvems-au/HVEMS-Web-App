import type { Metadata } from "next";
import Link from "next/link";
import { getWorkforceData, listMembers } from "@hvems/api-client";
import { LEAVE_LABELS, credentialStatus, todayISO } from "@hvems/domain";
import { ROLE_LABELS } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technicians" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** The people who do work orders: availability, leave, qualifications and current work (CS-19). */
export default async function TechniciansPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "workforce.manage");
  const db = await createSupabaseServerClient();
  const today = todayISO(ctx.timezone);
  const [members, data, warnSetting] = await Promise.all([
    listMembers(db, orgId),
    getWorkforceData(db, orgId, { today }),
    db.from("platform_settings").select("value").eq("key", "drivers.credential_warning_days").maybeSingle(),
  ]);
  const warnDays = Number(warnSetting.data?.value ?? 30) || 30;
  const people = members
    // Technicians only (main or additional role), the same people work orders can be assigned to.
    .filter((m) => m.status === "active" && (m.role === "technician" || (m.additional_roles ?? []).includes("technician")))
    .sort((a, b) => (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""));
  const base = `/customer/${orgId}/technicians`;

  return (
    <>
      <PageHeader title="Technicians" description="Who's available, their qualifications and their current work." />
      <Card>
        {people.length === 0 ? (
          <EmptyState title="No technicians yet">Invite technicians from the Team page. A manager who also does workshop jobs can be given Technician as an additional role.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Trade</TH>
                <TH>Availability</TH>
                <TH>Qualifications</TH>
                <TH className="text-right">Open work</TH>
              </tr>
            </THead>
            <tbody>
              {people.map((m) => {
                const profile = data.profiles.find((p) => p.user_id === m.user_id) ?? null;
                const quals = data.qualifications.filter((q) => q.user_id === m.user_id);
                const statuses = quals.map((q) => credentialStatus(q.expires_on, today, warnDays));
                const expired = statuses.filter((s) => s === "expired").length;
                const expiring = statuses.filter((s) => s === "expiring").length;
                const leave = data.leave.filter((l) => l.user_id === m.user_id);
                const now = leave.find((l) => l.starts_on <= today && l.ends_on >= today);
                const next = leave.find((l) => l.starts_on > today);
                const open = data.workOrders.filter((w) => w.assigned_to === m.user_id).length;
                return (
                  <TR key={m.user_id}>
                    <TD>
                      <Link href={`${base}/${m.user_id}`} className="font-semibold text-link hover:underline">
                        {m.profile?.full_name || m.profile?.email}
                      </Link>
                      <span className="block text-[12.5px] text-ink-subtle">{m.role === "technician" ? ROLE_LABELS[m.role] : `${ROLE_LABELS[m.role]} · also Technician`}</span>
                    </TD>
                    <TD className="text-ink-muted">{profile?.trade ?? "—"}</TD>
                    <TD>
                      {now ? (
                        <Badge tone="amber">
                          {LEAVE_LABELS[now.kind]} until {dmy(now.ends_on)}
                        </Badge>
                      ) : profile && !profile.available ? (
                        <Badge tone="grey">Not available</Badge>
                      ) : (
                        <Badge tone="green">Available</Badge>
                      )}
                      {next ? <span className="mt-1 block text-[12px] text-ink-subtle">Leave from {dmy(next.starts_on)}</span> : null}
                    </TD>
                    <TD>
                      <span className="text-ink-muted">{quals.length || "None"}</span>
                      {expired ? (
                        <Badge tone="red" className="ml-2">
                          {expired} expired
                        </Badge>
                      ) : null}
                      {expiring ? (
                        <Badge tone="amber" className="ml-2">
                          {expiring} expiring
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="text-right font-semibold">{open || <span className="font-normal text-ink-subtle">0</span>}</TD>
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
