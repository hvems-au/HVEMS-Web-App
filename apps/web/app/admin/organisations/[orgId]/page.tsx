import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAssetConditionCounts,
  getOrganisation,
  isSupportSessionActive,
  listAssets,
  listAssetCountEvents,
  listClients,
  listInvitations,
  listMemberSignInLocks,
  listMembers,
  listSites,
  listSupportSessions,
} from "@hvems/api-client";
import { formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { GRANT_LABELS, KIND_LABELS, ROLE_LABELS } from "@hvems/permissions";
import type { Organisation } from "@hvems/types";
import { ConditionBadge } from "@/components/condition";
import { PageHeader } from "@/components/shell/page";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/primitives";
import { getSessionUser, getStaffContext } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import {
  AdminSignInLock,
  OrganisationDetailsForm,
  ResetMfaButton,
  SupportAccessCard,
  SuspensionForm,
} from "./forms";

export const metadata: Metadata = { title: "Organisation" };

const STATUS_TONE = {
  active: "green",
  restricted: "amber",
  suspended: "red",
  closing: "grey",
  closed: "grey",
} as const;
const STATUS_LABEL = {
  active: "Active",
  restricted: "Restricted (billing)",
  suspended: "De-activated",
  closing: "Closing",
  closed: "Closed",
} as const;
const TABS = [
  { id: "details", label: "Details" },
  { id: "team", label: "Team" },
  { id: "equipment", label: "Equipment" },
  { id: "clients", label: "Clients & Sites" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * Super Admin view of one organisation (ADM-02). The Super Admin can see the
 * organisation's team and full fleet at any time (decision O-05). Each view of
 * those records is written to the organisation's security events, which its
 * admins can see. Support Agents see details and team only (fleet records stay
 * behind support access for them, enforced by the database).
 */
export default async function AdminOrganisationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const requested = firstParam(sp.tab);
  const tab: Tab = TABS.some((t) => t.id === requested)
    ? (requested as Tab)
    : "details";
  const db = await createSupabaseServerClient();
  const [org, staff, user, sessions, maxSetting] = await Promise.all([
    getOrganisation(db, orgId).catch(() => null),
    getStaffContext(),
    getSessionUser(),
    listSupportSessions(db, orgId).catch(() => []),
    db
      .from("platform_settings")
      .select("value")
      .eq("key", "support_access.max_minutes")
      .maybeSingle(),
  ]);
  if (!org) notFound();
  const superAdmin = staff?.role === "platform_administrator";
  const mySession =
    sessions.find(
      (x) => x.staff_user_id === user?.id && isSupportSessionActive(x),
    ) ?? null;
  // Team and fleet records: the Super Admin directly (O-05), Support Agents inside a support session.
  const canSee = superAdmin || !!mySession;
  const base = `/admin/organisations/${orgId}`;

  // Transparency for the customer: record each time HVEMS opens its team or fleet records.
  if (tab !== "details" && user) {
    await createSupabaseAdminClient()
      .from("security_events")
      .insert({
        user_id: user.id,
        organisation_id: orgId,
        event_type: "hvems_staff_viewed_records",
        detail: { area: tab, role: staff?.role ?? null },
      });
  }

  return (
    <>
      <PageHeader
        title={org.name}
        description={`${KIND_LABELS[org.kind]} · joined ${formatDateAU(new Date(org.created_at))}`}
        breadcrumb={{ label: "Organisations", href: "/admin/organisations" }}
        actions={
          <Badge tone={STATUS_TONE[org.status]}>
            {STATUS_LABEL[org.status]}
          </Badge>
        }
      />
      <SupportAccessCard
        orgId={orgId}
        directAccess={superAdmin}
        maxMinutes={Number(maxSetting.data?.value) || 60}
        active={
          mySession
            ? {
                id: mySession.id,
                reason: mySession.reason,
                untilText: new Date(mySession.expires_at).toLocaleTimeString(
                  "en-AU",
                  {
                    timeZone: "Australia/Brisbane",
                    hour: "numeric",
                    minute: "2-digit",
                  },
                ),
              }
            : null
        }
      />
      <nav
        className="mb-5 flex gap-1 border-b border-stroke"
        aria-label="Organisation sections"
      >
        {TABS.filter(
          (t) =>
            org.kind === "company" ||
            (t.id !== "equipment" && t.id !== "clients"),
        ).map((t) => (
          <Link
            key={t.id}
            href={t.id === "details" ? base : `${base}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium",
              tab === t.id
                ? "border-brand text-brand-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "details" ? (
        <DetailsTab org={org} superAdmin={superAdmin} />
      ) : null}
      {tab === "team" ? (
        <TeamTab orgId={orgId} superAdmin={superAdmin} />
      ) : null}
      {tab === "equipment" ? (
        <EquipmentTab
          orgId={orgId}
          superAdmin={canSee}
          archived={firstParam(sp.archived) === "1"}
        />
      ) : null}
      {tab === "clients" ? (
        <ClientsTab orgId={orgId} superAdmin={canSee} />
      ) : null}
    </>
  );
}

async function DetailsTab({
  org,
  superAdmin,
}: {
  org: Organisation;
  superAdmin: boolean;
}) {
  const db = await createSupabaseServerClient();
  const [members, counts] = await Promise.all([
    db
      .from("org_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id)
      .eq("status", "active"),
    org.kind === "company" && superAdmin
      ? getAssetConditionCounts(db, org.id)
      : Promise.resolve(null),
  ]);
  const history =
    org.kind === "company"
      ? await listAssetCountEvents(db, org.id, 20).catch(() => [])
      : [];
  const REASON: Record<string, string> = {
    created: "Added",
    imported: "Imported",
    archived: "Archived",
    restored: "Restored",
    converted: "Converted",
    merged: "Merged",
  };
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Details"
            description="Changes are recorded in the organisation's audit history."
          />
          <CardBody>
            <OrganisationDetailsForm org={org} canEdit={superAdmin} />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Status" />
            <CardBody className="text-[14px]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-ink-subtle">Status</dt>
                <dd className="font-medium">{STATUS_LABEL[org.status]}</dd>
                <dt className="text-ink-subtle">Active members</dt>
                <dd>{members.count ?? "—"}</dd>
                {counts ? (
                  <>
                    <dt className="text-ink-subtle">Current equipment</dt>
                    <dd>
                      {counts.total} ({counts.active} active,{" "}
                      {counts.needs_attention} needs attention,{" "}
                      {counts.out_of_service} out of service)
                    </dd>
                  </>
                ) : null}
                {org.status === "suspended" && org.suspended_at ? (
                  <>
                    <dt className="text-ink-subtle">De-activated</dt>
                    <dd>{formatDateTimeAU(new Date(org.suspended_at))}</dd>
                    <dt className="text-ink-subtle">Reason</dt>
                    <dd className="whitespace-pre-wrap">
                      {org.suspension_reason}
                    </dd>
                  </>
                ) : null}
              </dl>
            </CardBody>
          </Card>
          {superAdmin && org.status !== "closed" && org.status !== "closing" ? (
            <Card>
              <CardHeader
                title={org.status === "suspended" ? "Reinstate" : "De-activate"}
                description={
                  org.status === "suspended"
                    ? "Lifts the suspension. Members can add equipment and invite people again."
                    : "Members can still sign in and keep their safety records (inspections, defects, clearance), but can't add equipment, invite members, or post or accept jobs."
                }
              />
              <CardBody>
                <SuspensionForm org={org} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
      {history.length ? (
        <Card className="mt-5">
          <CardHeader
            title="Equipment count history"
            description="Every change to the number of current assets, used for the monthly fleet subscription (latest 20)."
          />
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Equipment</TH>
                <TH>Change</TH>
                <TH>Count</TH>
              </tr>
            </THead>
            <tbody>
              {history.map((h) => (
                <TR key={h.id}>
                  <TD className="whitespace-nowrap">
                    {formatDateTimeAU(new Date(h.occurred_at))}
                  </TD>
                  <TD>{h.asset?.asset_number ?? "—"}</TD>
                  <TD>
                    <Badge tone={h.delta > 0 ? "green" : "grey"}>
                      {REASON[h.reason] ?? h.reason} {h.delta > 0 ? "+1" : "−1"}
                    </Badge>
                  </TD>
                  <TD className="font-mono">
                    {h.count_before !== null && h.count_after !== null
                      ? `${h.count_before} → ${h.count_after}`
                      : "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}

async function TeamTab({
  orgId,
  superAdmin,
}: {
  orgId: string;
  superAdmin: boolean;
}) {
  const db = await createSupabaseServerClient();
  const [members, invitations, locks] = await Promise.all([
    listMembers(db, orgId),
    listInvitations(db, orgId).catch(() => []),
    superAdmin
      ? listMemberSignInLocks(db, orgId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const lockOf = new Map(locks.map((l) => [l.membership_id, l]));
  const timeText = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("en-AU", {
          timeZone: "Australia/Brisbane",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={`Members (${members.length})`} />
        {members.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Grants</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                {superAdmin ? <TH className="sr-only">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD className="font-semibold">
                    {m.profile?.full_name || "—"}
                  </TD>
                  <TD>
                    {m.profile?.email ?? "—"}
                    {superAdmin && lockOf.get(m.id) ? (
                      <AdminSignInLock
                        orgId={orgId}
                        userId={m.user_id}
                        name={
                          m.profile?.full_name ||
                          m.profile?.email ||
                          "this person"
                        }
                        failedCount={lockOf.get(m.id)!.failed_count}
                        lockedUntilText={timeText(
                          lockOf.get(m.id)!.locked_until,
                        )}
                      />
                    ) : null}
                  </TD>
                  <TD>{ROLE_LABELS[m.role]}</TD>
                  <TD className="text-ink-muted">
                    {(m.grants ?? [])
                      .filter((g) => !g.revoked_at)
                      .map((g) => GRANT_LABELS[g.grant_type])
                      .join(", ") || "—"}
                  </TD>
                  <TD>
                    <Badge tone={m.status === "active" ? "green" : "amber"}>
                      {m.status}
                    </Badge>
                  </TD>
                  <TD>{formatDateAU(new Date(m.created_at))}</TD>
                  {superAdmin ? (
                    <TD className="text-right">
                      <ResetMfaButton
                        orgId={orgId}
                        userId={m.user_id}
                        name={
                          m.profile?.full_name ||
                          m.profile?.email ||
                          "this person"
                        }
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {invitations.length ? (
        <Card>
          <CardHeader title={`Pending invitations (${invitations.length})`} />
          <Table>
            <THead>
              <tr>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Expires</TH>
              </tr>
            </THead>
            <tbody>
              {invitations.map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD>{ROLE_LABELS[i.role]}</TD>
                  <TD>{formatDateTimeAU(new Date(i.expires_at))}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function SupportOnly() {
  return (
    <Card>
      <EmptyState title="Fleet records need support access">
        Support Agents see an organisation&apos;s fleet only inside a logged
        support-access session. The Super Admin can view it directly.
      </EmptyState>
    </Card>
  );
}

async function EquipmentTab({
  orgId,
  superAdmin,
  archived,
}: {
  orgId: string;
  superAdmin: boolean;
  archived: boolean;
}) {
  if (!superAdmin) return <SupportOnly />;
  const db = await createSupabaseServerClient();
  const { rows, total } = await listAssets(db, {
    organisationId: orgId,
    status: archived ? "archived" : "current",
    pageSize: 100,
  });
  const base = `/admin/organisations/${orgId}?tab=equipment`;
  return (
    <Card>
      <CardHeader
        title={`${archived ? "Archived" : "Current"} equipment (${total})`}
        description={
          total > rows.length ? `Showing the first ${rows.length}.` : undefined
        }
        action={
          <Link
            href={archived ? base : `${base}&archived=1`}
            className="text-[13px] font-semibold text-link hover:underline"
          >
            {archived ? "Show current" : "Show archived"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title={archived ? "No archived equipment" : "No equipment yet"}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Asset</TH>
              <TH>Class</TH>
              <TH>Make / model</TH>
              <TH>Registration / serial</TH>
              <TH>Site</TH>
              <TH>Condition</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((a) => (
              <TR key={a.id}>
                <TD className="font-semibold">{a.asset_number}</TD>
                <TD>{a.asset_class?.name ?? "—"}</TD>
                <TD>{[a.make, a.model].filter(Boolean).join(" ") || "—"}</TD>
                <TD>{a.registration_number ?? a.serial_number ?? "—"}</TD>
                <TD>{a.site?.name ?? "—"}</TD>
                <TD>
                  <ConditionBadge condition={a.condition} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function ClientsTab({
  orgId,
  superAdmin,
}: {
  orgId: string;
  superAdmin: boolean;
}) {
  if (!superAdmin) return <SupportOnly />;
  const db = await createSupabaseServerClient();
  const [clients, sites] = await Promise.all([
    listClients(db, orgId),
    listSites(db, orgId),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={`Clients (${clients.length})`} />
        {clients.length === 0 ? (
          <EmptyState title="No clients" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Client</TH>
                <TH>ABN</TH>
                <TH>Contact</TH>
              </tr>
            </THead>
            <tbody>
              {clients.map((c) => (
                <TR key={c.id}>
                  <TD className="font-semibold">{c.name}</TD>
                  <TD>{c.abn ?? "—"}</TD>
                  <TD>
                    {[c.contact_name, c.contact_email, c.contact_phone]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title={`Sites (${sites.length})`} />
        {sites.length === 0 ? (
          <EmptyState title="No sites" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Site</TH>
                <TH>Client</TH>
                <TH>Location</TH>
                <TH>Timezone</TH>
              </tr>
            </THead>
            <tbody>
              {sites.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.name}</TD>
                  <TD>
                    {s.client_id ? clientName.get(s.client_id) : "Own site"}
                  </TD>
                  <TD>
                    {[s.suburb, s.state, s.postcode]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </TD>
                  <TD>{s.timezone.replace("Australia/", "")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
