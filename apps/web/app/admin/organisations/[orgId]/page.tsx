import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrganisation } from "@hvems/api-client";
import { formatDateAU, formatDateTimeAU } from "@hvems/domain";
import { KIND_LABELS } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrganisationDetailsForm, SuspensionForm } from "./forms";

export const metadata: Metadata = { title: "Organisation" };

const STATUS_TONE = { active: "green", restricted: "amber", suspended: "red", closing: "grey", closed: "grey" } as const;
const STATUS_LABEL = { active: "Active", restricted: "Restricted (billing)", suspended: "De-activated", closing: "Closing", closed: "Closed" } as const;

/**
 * Super Admin view of one organisation (ADM-02). Customer records stay private:
 * this page shows only the organisation's own details. Editing and
 * de-activation are Super Admin only (Support Agents view; spec B.5), and the
 * database enforces that whatever this page shows.
 */
export default async function AdminOrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const db = await createSupabaseServerClient();
  const [org, staff, members] = await Promise.all([
    getOrganisation(db, orgId).catch(() => null),
    getStaffContext(),
    db.from("org_memberships").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("status", "active"),
  ]);
  if (!org) notFound();
  const superAdmin = staff?.role === "platform_administrator";

  return (
    <>
      <PageHeader
        title={org.name}
        description={`${KIND_LABELS[org.kind]} · joined ${formatDateAU(new Date(org.created_at))}`}
        breadcrumb={{ label: "Organisations", href: "/admin/organisations" }}
        actions={<Badge tone={STATUS_TONE[org.status]}>{STATUS_LABEL[org.status]}</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Details" description="Changes are recorded in the organisation's audit history." />
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
                {org.status === "suspended" && org.suspended_at ? (
                  <>
                    <dt className="text-ink-subtle">De-activated</dt>
                    <dd>{formatDateTimeAU(new Date(org.suspended_at))}</dd>
                    <dt className="text-ink-subtle">Reason</dt>
                    <dd className="whitespace-pre-wrap">{org.suspension_reason}</dd>
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
    </>
  );
}
