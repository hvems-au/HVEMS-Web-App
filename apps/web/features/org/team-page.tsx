import { listInvitations, listMembers } from "@hvems/api-client";
import { formatDateAU } from "@hvems/domain";
import { GRANT_ELIGIBLE_ROLES, GRANT_LABELS, ROLE_LABELS, ROLES_BY_KIND, OWNER_ROLE_BY_KIND, can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import type { OrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteDialog, MemberActions, RevokeInvitationButton } from "./team-controls";

export async function TeamPage({ ctx, portal }: { ctx: OrgContext; portal: "customer" | "provider" }) {
  const orgId = ctx.context.organisation_id;
  const kind = ctx.context.kind;
  const db = await createSupabaseServerClient();
  const manage = can(ctx.capabilities, "org.members.manage");
  const [members, invitations] = await Promise.all([listMembers(db, orgId), manage ? listInvitations(db, orgId) : Promise.resolve([])]);
  const owner = OWNER_ROLE_BY_KIND[kind];
  const invitableRoles = ROLES_BY_KIND[kind].filter((r) => r !== owner);
  const canGrant = can(ctx.capabilities, "org.grants.assign") && kind === "company";

  return (
    <>
      <PageHeader
        title="Team"
        description={
          kind === "company"
            ? "Members, roles and grants. Companies with five or fewer assets can have up to five member logins; driver profiles are unlimited."
            : kind === "provider"
              ? "Provider Managers find jobs and manage engagements; Provider Technicians work on engagements assigned to them."
              : "Job Managers can post and manage jobs for this account."
        }
        actions={manage ? <InviteDialog portal={portal} orgId={orgId} roles={invitableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} /> : null}
      />
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
                return (
                  <TR key={m.id}>
                    <TD>
                      <p className="font-semibold">
                        {m.profile?.full_name || m.profile?.email} {self ? <span className="font-normal text-ink-subtle">(you)</span> : null}
                      </p>
                      <p className="text-[12px] text-ink-subtle">{m.profile?.email}</p>
                    </TD>
                    <TD>{ROLE_LABELS[m.role]}</TD>
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
