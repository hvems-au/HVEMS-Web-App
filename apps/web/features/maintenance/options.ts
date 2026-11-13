import "server-only";
import { listMembers, type HvemsClient } from "@hvems/api-client";
import { ROLE_CAPABILITIES, type MemberRole } from "@hvems/permissions";

/** People who work on jobs (technicians and managers); the database checks it again. */
const worksOnJobs = (roles: MemberRole[]) => roles.some((r) => ROLE_CAPABILITIES[r]?.some((c) => c === "work_orders.work" || c === "work_orders.manage"));

/** Equipment and people to choose from in the maintenance dialogs. */
export async function maintenanceOptions(db: HvemsClient, orgId: string) {
  const [assets, members] = await Promise.all([
    db
      .from("assets")
      .select("id, asset_number, make, model")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("asset_number")
      .limit(2000)
      .then((r) => (r.data ?? []) as { id: string; asset_number: string; make: string | null; model: string | null }[]),
    listMembers(db, orgId),
  ]);
  return {
    equipment: assets.map((a) => ({ value: a.id, label: `${a.asset_number}${a.make || a.model ? ` · ${[a.make, a.model].filter(Boolean).join(" ")}` : ""}` })),
    people: members
      .filter((m) => m.status === "active" && worksOnJobs([m.role, ...((m.additional_roles ?? []) as MemberRole[])]))
      .map((m) => ({ value: m.user_id, label: m.profile?.full_name || m.profile?.email || "Member" })),
    nameOf: new Map(members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || "Member"])),
  };
}
