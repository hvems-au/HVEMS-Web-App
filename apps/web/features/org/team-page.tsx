import { isSupportSessionActive, listInvitations, listMemberSignInLocks, listMembers, listSupportSessions } from "@hvems/api-client";
import { formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { GRANT_ELIGIBLE_ROLES, GRANT_LABELS, ROLE_LABELS, ROLES_BY_KIND, OWNER_ROLE_BY_KIND, can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import type { OrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteDialog, MemberActions, RevokeInvitationButton } from "./team-controls";
import { EndSupportButton } from "./support-sessions";
import { MemberSignInLock } from "./unlock-button";

export async function TeamPage({ ctx, portal }: { ctx: OrgContext; portal: "customer" | "provider" }) {
  const orgId = ctx.context.organisation_id;
  const kind = ctx.context.kind;
  const db = await createSupabaseServerClient();
  const manage = can(ctx.capabilities, "org.members.manage");
  const [members, invitations, locks, support] = await Promise.all([
    listMembers(db, orgId),
    manage ? listInvitations(db, orgId) : Promise.resolve([]),
    manage ? listMemberSignInLocks(db, orgId).catch(() => []) : Promise.resolve([]),
    can(ctx.capabilities, "support_access.view") ? listSupportSessions(db, orgId, 10).catch(() => []) : Promise.resolve(null),
  ]);
  const lockOf = new Map(locks.map((l) => [l.membership_id, l]));
  const timeText = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-AU", { timeZone: ctx.timezone, hour: "numeric", minute: "2-digit" }) : null;
  const owner = OWNER_ROLE_BY_KIND[kind];
  const invitableRoles = ROLES_BY_KIND[kind].filter((r) => r !== owner);
  const canGrant = can(ctx.capabilities, "org.grants.assign") && kind === "company";

  return (
    <>
      <PageHeader
        title="Team"
        description={
          kind === "company"
            ? "Members, roles and grants."
            : kind === "provider"
              ? "Provider Managers find jobs and manage engagements; Provider Technicians work on engagements assigned to them."
              : "Job Managers can post and manage jobs for this account."
        }
        actions={manage ? <InviteDialog portal={portal} orgId={orgId} roles={invitableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} /> : null}
      />
      {support && support.length ? (
        <Card className="mb-5">
          <CardHeader title="HVEMS support access" description="HVEMS staff can view your records only in a logged, read-only session of up to 60 minutes. You can end one at any time." />
          <CardBody className="px-0 pb-1">
            <Table>
              <THead>
                <tr>
                  <TH>Started</TH>
                  <TH>Reason</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {support.map((x) => {
                  const live = isSupportSessionActive(x);
                  return (
                    <TR key={x.id}>
                      <TD className="whitespace-nowrap">{formatDateTimeAU(new Date(x.starts_at), ctx.timezone)}</TD>
                      <TD className="text-ink-muted">{x.reason}</TD>
                      <TD>
                        {live ? (
                          <Badge tone="blue">Active until {formatDateTimeAU(new Date(x.expires_at), ctx.timezone).split(", ")[1]}</Badge>
                        ) : (
                          <Badge tone="grey">{x.ended_at ? "Ended" : "Expired"}</Badge>
                        )}
                      </TD>
                      <TD className="text-right">{live ? <EndSupportButton portal={portal} orgId={orgId} grantId={x.id} /> : null}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <CardBody className="px-0 pb-1">
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Role</TH>
                {kind === "company" ? <TH>Grants</TH> : null}
                <TH>Joined</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {members.map((m) => {
                const grants = (m.grants ?? []).filter((g) => !g.revoked_at);
                const isOwner = m.role === owner;
                const self = m.user_id === ctx.user.id;
                const lock = lockOf.get(m.id);
                return (
                  <TR key={m.id}>
                    <TD>
                      <p className="font-semibold">
                        {m.profile?.full_name || m.profile?.email} {self ? <span className="font-normal text-ink-subtle">(you)</span> : null}
                      </p>
                      <p className="text-[12px] text-ink-subtle">{m.profile?.email?.endsWith(".invalid") ? "Signs in with an Operator ID and PIN" : m.profile?.email}</p>
                      {lock && !self ? (
                        <MemberSignInLock
                          portal={portal}
                          orgId={orgId}
                          membershipId={m.id}
                          name={m.profile?.full_name || m.profile?.email || "this member"}
                          failedCount={lock.failed_count}
                          lockedUntilText={timeText(lock.locked_until)}
                        />
                      ) : null}
                    </TD>
                    <TD>
                      {ROLE_LABELS[m.role]}
                      {m.additional_roles?.length ? (
                        <span className="block text-[12.5px] text-ink-muted">+ {m.additional_roles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
                      ) : null}
                    </TD>
                    {kind === "company" ? (
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {isOwner ? <Badge tone="orange">Clearance Authority (Owner)</Badge> : null}
                          {grants.map((g) => (
                            <Badge key={g.id} tone="blue" title={g.competency_note ?? undefined}>
                              {GRANT_LABELS[g.grant_type]}
                              {g.approval_limit_cents !== null ? ` · $${(g.approval_limit_cents / 100).toLocaleString("en-AU")}` : ""}
                            </Badge>
                          ))}
                          {!isOwner && grants.length === 0 ? <span className="text-ink-subtle">—</span> : null}
                        </div>
                      </TD>
                    ) : null}
                    <TD>{formatDateAU(new Date(m.created_at), ctx.timezone)}</TD>
                    {manage ? (
                      <TD className="text-right">
                        {!isOwner && !self ? (
                          <MemberActions
                            portal={portal}
                            orgId={orgId}
                            membershipId={m.id}
                            name={m.profile?.full_name || m.profile?.email || "member"}
                            role={m.role}
                            additionalRoles={m.additional_roles ?? []}
                            operatorProfile={!!m.profile?.email?.endsWith(".invalid")}
                            roles={invitableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                            grants={canGrant ? grants.map((g) => ({ id: g.id, label: GRANT_LABELS[g.grant_type] })) : []}
                            assignable={
                              canGrant
                                ? (Object.keys(GRANT_ELIGIBLE_ROLES) as (keyof typeof GRANT_ELIGIBLE_ROLES)[])
                                    .filter((g) => GRANT_ELIGIBLE_ROLES[g].includes(m.role))
                                    .map((g) => ({ value: g, label: GRANT_LABELS[g] }))
                                : []
                            }
                          />
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {manage ? (
        <Card className="mt-5">
          <CardHeader title="Pending invitations" description="Invitations expire after 7 days. Only the invited email address can accept." />
          <CardBody className="px-0 pb-1">
            {invitations.length === 0 ? (
              <EmptyState title="No pending invitations" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Email</TH>
                    <TH>Role</TH>
                    <TH>Expires</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {invitations.map((i) => (
                    <TR key={i.id}>
                      <TD>{i.email}</TD>
                      <TD>{ROLE_LABELS[i.role]}</TD>
                      <TD>{formatDateAU(new Date(i.expires_at), ctx.timezone)}</TD>
                      <TD className="text-right">
                        <RevokeInvitationButton portal={portal} orgId={orgId} invitationId={i.id} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
