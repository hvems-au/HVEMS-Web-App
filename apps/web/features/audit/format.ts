/** Shared presentation of audit events for the company/provider and HVEMS console views. */
export const ENTITY_LABELS: Record<string, string> = {
  organisations: "Organisation",
  org_memberships: "Membership",
  membership_grants: "Grant",
  invitations: "Invitation",
  support_access_grants: "Support access",
  platform_staff: "HVEMS staff",
  platform_settings: "Platform setting",
  clients: "Client",
  sites: "Site",
  assets: "Equipment",
  asset_operator_permissions: "Permitted operator",
  asset_condition_causes: "Condition cause",
  meter_readings: "Odometer / hour meter reading",
  fleet_subscription_consents: "Subscription consent",
};

export function summarise(action: string, changes: Record<string, unknown>): string {
  if (action === "update") return `Changed ${Object.keys(changes).join(", ")}`;
  if (action === "insert") {
    const c = changes as Record<string, string>;
    return c.asset_number ?? c.name ?? c.email ?? c.role ?? c.grant_type ?? c.key ?? "Created";
  }
  if (action === "archive") return `Archived: ${(changes as { reason?: string }).reason ?? ""}`;
  if (action === "import") return `Imported ${(changes as { rows?: number }).rows ?? ""} assets`;
  return action;
}

export function methodTone(method: string): "orange" | "green" | "grey" {
  return method === "support_access" ? "orange" : method === "password_mfa" ? "green" : "grey";
}
