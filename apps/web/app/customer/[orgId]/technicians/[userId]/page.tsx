import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWorkOrderNumber, getWorkforceData, listMembers } from "@hvems/api-client";
import { LEAVE_LABELS, credentialStatus, qualificationText, todayISO } from "@hvems/domain";
import { can, ROLE_LABELS } from "@hvems/permissions";
import { WorkOrderStatusBadge } from "@/features/maintenance/badges";
import { AddLeaveDialog, CancelLeaveButton, DeleteQualificationButton, ProfileDialog, QualificationDialog } from "@/features/workforce/controls";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const STATUS = {
  expired: { tone: "red", text: (d: string) => `Expired ${d}` },
  expiring: { tone: "amber", text: (d: string) => `Expires ${d}` },
  current: { tone: "green", text: (d: string) => `Expires ${d}` },
  no_expiry: { tone: "grey", text: () => "No expiry" },
} as const;

/** One person: profile, qualifications, leave and open work. Managers edit; people see their own. */
export default async function TechnicianPage({ params }: { params: Promise<{ orgId: string; userId: string }> }) {
  const { orgId, userId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const manage = can(ctx.capabilities, "workforce.manage");
  if (!manage && ctx.user.id !== userId) notFound();
  const db = await createSupabaseServerClient();
  const today = todayISO(ctx.timezone);
  const [members, data, warnSetting] = await Promise.all([
    listMembers(db, orgId),
    getWorkforceData(db, orgId, { today, userId, allLeave: true }),
    db.from("platform_settings").select("value").eq("key", "drivers.credential_warning_days").maybeSingle(),
  ]);
  const member = members.find((m) => m.user_id === userId && m.status === "active");
  if (!member) notFound();
  const warnDays = Number(warnSetting.data?.value ?? 30) || 30;
  const name = member.profile?.full_name || member.profile?.email || "Team member";
  const profile = data.profiles[0] ?? null;
  const activeLeave = data.leave.filter((l) => !l.cancelled_at);
  const onLeave = activeLeave.find((l) => l.starts_on <= today && l.ends_on >= today);
  const upcoming = activeLeave.filter((l) => l.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const past = data.leave.filter((l) => l.cancelled_at || l.ends_on < today).slice(0, 10);

  return (
    <>
      <PageHeader
        title={name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {ROLE_LABELS[member.role]}
            {profile?.trade ? ` · ${profile.trade}` : ""}
            {onLeave ? (
              <Badge tone="amber">
                {LEAVE_LABELS[onLeave.kind]} until {dmy(onLeave.ends_on)}
              </Badge>
            ) : profile && !profile.available ? (
              <Badge tone="grey">Not available</Badge>
            ) : (
              <Badge tone="green">Available</Badge>
            )}
          </span>
        }
        breadcrumb={manage ? { label: "Technicians", href: `/customer/${orgId}/technicians` } : undefined}
        actions={
          manage ? (
            <>
              <ProfileDialog orgId={orgId} userId={userId} name={name} profile={profile} />
              <AddLeaveDialog orgId={orgId} userId={userId} name={name} />
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Qualifications" action={manage ? <QualificationDialog orgId={orgId} userId={userId} /> : null} />
          <CardBody className="px-0 pb-1">
            {data.qualifications.length === 0 ? (
              <p className="px-5 pb-4 text-[14px] text-ink-muted">None recorded yet.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Qualification</TH>
                    <TH>Number</TH>
                    <TH>Expiry</TH>
                    {manage ? <TH className="text-right">Actions</TH> : null}
                  </tr>
                </THead>
                <tbody>
                  {data.qualifications.map((q) => {
                    const s = STATUS[credentialStatus(q.expires_on, today, warnDays)];
                    return (
                      <TR key={q.id}>
                        <TD className="font-medium">
                          {qualificationText(q)}
                          {q.issued_by ? <span className="block text-[12.5px] font-normal text-ink-subtle">{q.issued_by}</span> : null}
                        </TD>
                        <TD className="text-ink-muted">{q.number ?? "—"}</TD>
                        <TD>
                          <Badge tone={s.tone}>{s.text(q.expires_on ? dmy(q.expires_on) : "")}</Badge>
                        </TD>
                        {manage ? (
                          <TD>
                            <div className="flex justify-end gap-1">
                              <QualificationDialog orgId={orgId} userId={userId} existing={q} />
                              <DeleteQualificationButton orgId={orgId} userId={userId} id={q.id} title={qualificationText(q)} />
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader title="Profile" />
          <CardBody className="flex flex-col gap-2 text-[14px]">
            <p>
              <span className="text-ink-subtle">Email</span>
              <span className="block text-ink">{member.profile?.email ?? "—"}</span>
            </p>
            <p>
              <span className="text-ink-subtle">Phone</span>
              <span className="block text-ink">{profile?.phone ?? "—"}</span>
            </p>
            {profile?.notes ? <p className="rounded-[8px] bg-surface-muted p-3 whitespace-pre-wrap text-ink-muted">{profile.notes}</p> : null}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Leave" />
          <CardBody className="px-0 pb-1">
            {upcoming.length === 0 && past.length === 0 ? (
              <p className="px-5 pb-4 text-[14px] text-ink-muted">No leave recorded.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Dates</TH>
                    <TH>Type</TH>
                    <TH>Note</TH>
                    {manage ? <TH className="text-right">Actions</TH> : null}
                  </tr>
                </THead>
                <tbody>
                  {[...upcoming, ...past].map((l) => {
                    const dates = l.starts_on === l.ends_on ? dmy(l.starts_on) : `${dmy(l.starts_on)} – ${dmy(l.ends_on)}`;
                    const finished = !!l.cancelled_at || l.ends_on < today;
                    return (
                      <TR key={l.id} className={finished ? "text-ink-subtle" : undefined}>
                        <TD className="whitespace-nowrap">
                          {dates}
                          {l.cancelled_at ? (
                            <Badge tone="grey" className="ml-2">
                              Cancelled
                            </Badge>
                          ) : null}
                        </TD>
                        <TD>{LEAVE_LABELS[l.kind]}</TD>
                        <TD className="text-ink-muted">{l.note ?? "—"}</TD>
                        {manage ? (
                          <TD className="text-right">
                            {!finished ? <CancelLeaveButton orgId={orgId} userId={userId} id={l.id} label={`${LEAVE_LABELS[l.kind].toLowerCase()} ${dates}`} /> : null}
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader title={`Open work (${data.workOrders.length})`} />
          <CardBody className={data.workOrders.length ? "flex flex-col divide-y divide-stroke px-0 pb-0" : undefined}>
            {data.workOrders.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Nothing assigned.</p>
            ) : (
              data.workOrders.map((w) => (
                <Link key={w.id} href={`/customer/${orgId}/work-orders/${w.id}`} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[14px] hover:bg-surface-muted/60">
                  <span className="min-w-0">
                    <span className="font-mono text-[12.5px] font-semibold text-link">{formatWorkOrderNumber(w.number)}</span>
                    <span className="block truncate text-ink">{w.title}</span>
                    <span className="block text-[12px] text-ink-subtle">
                      {w.asset?.asset_number ?? ""}
                      {w.due_on ? ` · due ${dmy(w.due_on)}` : ""}
                    </span>
                  </span>
                  <WorkOrderStatusBadge status={w.status} />
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
