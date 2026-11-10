/**
 * HVEMS role, grant and capability model — SoW §2.4.
 *
 * This file mirrors the capability seed in
 * supabase/migrations/20261109072440_identity.sql. The database is the
 * enforcement point (RLS + RPC checks); this mirror lets web and mobile
 * clients shape navigation and controls. `matrix.test.ts` fails if the two
 * drift apart.
 *
 * Interpretation notes (flagged in docs/requirements/interpretations.md):
 *  - "Fleet Manager or above" is read as Owner ⊇ Administrator ⊇ Fleet Manager
 *    for operational capabilities; Administrators still have no billing or
 *    closure authority.
 *  - Fleet Managers (and above) hold the clearance powers by role (O-09).
 *  - Fleet Managers create and edit equipment and clients (spec B.1); importing
 *    and archiving equipment, and managing sites, stay with Owner/Administrator.
 */

export const ORGANISATION_KINDS = ["company", "marketplace_customer", "provider"] as const;
export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];

export const COMPANY_ROLES = [
  "owner",
  "administrator",
  "fleet_manager",
  "technician",
  "driver_operator",
  "finance",
  "viewer",
] as const;
export const MARKETPLACE_CUSTOMER_ROLES = ["account_owner", "job_manager"] as const;
export const PROVIDER_ROLES = ["provider_owner", "provider_manager", "provider_technician"] as const;

export type CompanyRole = (typeof COMPANY_ROLES)[number];
export type MarketplaceCustomerRole = (typeof MARKETPLACE_CUSTOMER_ROLES)[number];
export type ProviderRole = (typeof PROVIDER_ROLES)[number];
export type MemberRole = CompanyRole | MarketplaceCustomerRole | ProviderRole;

export const MEMBER_GRANTS = ["clearance_authority", "approval_limit", "marketplace_buyer"] as const;
export type MemberGrant = (typeof MEMBER_GRANTS)[number];

export const PLATFORM_ROLES = ["platform_administrator", "support_agent"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const PLATFORM_AUTHORITIES = ["verification_officer", "billing_approver"] as const;
export type PlatformAuthority = (typeof PLATFORM_AUTHORITIES)[number];

export const CAPABILITIES = [
  "org.view",
  "org.settings.manage",
  "org.members.manage",
  "org.grants.assign",
  "org.billing.view",
  "org.billing.manage",
  "org.close",
  "audit.view",
  "support_access.view",
  "data.full_export",
  "assets.view",
  "assets.view_permitted",
  "assets.manage",
  "assets.import_archive",
  "assets.costs.view",
  "asset_classes.manage",
  "clients.view",
  "clients.manage",
  "sites.view",
  "sites.manage",
  "meter_readings.record",
  "meter_readings.accept",
  "templates.manage",
  "inspections.submit",
  "inspections.review",
  "defects.report",
  "defects.triage",
  "defects.clear_non_critical",
  "holds.place",
  "drivers.manage",
  "work_orders.manage",
  "work_orders.work",
  "workforce.manage",
  "parts.request",
  "parts.approve",
  "reports.view",
  "reports.export",
  "defects.clear_critical",
  "assets.return_to_service",
  "defects.lower_severity",
  "defects.dismiss_critical",
  "defects.defer_minor",
  "holds.remove_out_of_service",
  "marketplace.post",
  "marketplace.accept",
  "provider.profile.manage",
  "provider.verification.submit",
  "provider.jobs.browse",
  "provider.proposals.manage",
  "provider.engagements.manage",
  "provider.engagements.work",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Capabilities that come from Clearance Authority (SoW §2.4 grants table). */
const CLEARANCE: Capability[] = [
  "defects.clear_critical",
  "assets.return_to_service",
  "defects.lower_severity",
  "defects.dismiss_critical",
  "defects.defer_minor",
  "holds.remove_out_of_service",
];

const OPERATIONS_MANAGER: Capability[] = [
  "org.view",
  "assets.view",
  // Create and edit equipment and clients (spec B.1, reconciliation §3 item 2).
  "assets.manage",
  "assets.costs.view",
  // Company asset classes (decision O-03); Owner and Administrator inherit it.
  "asset_classes.manage",
  "clients.view",
  "clients.manage",
  "sites.view",
  "meter_readings.record",
  "meter_readings.accept",
  "inspections.submit",
  "inspections.review",
  "defects.report",
  "defects.triage",
  "defects.clear_non_critical",
  "holds.place",
  "drivers.manage",
  "work_orders.manage",
  "work_orders.work",
  "workforce.manage",
  "parts.request",
  "reports.view",
  "reports.export",
  // Owners and Fleet Managers clear defects and return equipment to service by role
  // (decision O-09); Company Admins inherit it. Others need the Clearance Authority grant.
  ...CLEARANCE,
];

const ADMINISTRATOR: Capability[] = [
  ...OPERATIONS_MANAGER,
  "org.settings.manage",
  "org.members.manage",
  "org.grants.assign",
  "audit.view",
  "assets.import_archive",
  "sites.manage",
  "templates.manage",
];

const ACCOUNT_OWNER_COMMON: Capability[] = [
  "org.view",
  "org.settings.manage",
  "org.members.manage",
  "org.billing.view",
  "org.billing.manage",
  "org.close",
  "audit.view",
  "support_access.view",
  "data.full_export",
];

export const ROLE_CAPABILITIES: Record<MemberRole, readonly Capability[]> = {
  owner: [
    ...ADMINISTRATOR,
    "org.billing.view",
    "org.billing.manage",
    "org.close",
    "support_access.view",
    "data.full_export",
    ...CLEARANCE,
    "marketplace.post",
    "marketplace.accept",
  ],
  administrator: ADMINISTRATOR,
  fleet_manager: OPERATIONS_MANAGER,
  technician: [
    "org.view",
    "assets.view",
    "clients.view",
    "sites.view",
    "meter_readings.record",
    "inspections.submit",
    "defects.report",
    "work_orders.work",
    "parts.request",
  ],
  driver_operator: [
    "org.view",
    "assets.view_permitted",
    "sites.view",
    "meter_readings.record",
    "inspections.submit",
    "defects.report",
  ],
  finance: [
    "org.view",
    "org.billing.view",
    "org.billing.manage",
    "assets.view",
    "assets.costs.view",
    "clients.view",
    "sites.view",
    "reports.view",
    "reports.export",
  ],
  viewer: ["org.view", "assets.view", "assets.costs.view", "clients.view", "sites.view", "reports.view", "reports.export"],
  account_owner: [...ACCOUNT_OWNER_COMMON, "marketplace.post", "marketplace.accept"],
  job_manager: ["org.view", "marketplace.post", "marketplace.accept"],
  provider_owner: [
    ...ACCOUNT_OWNER_COMMON,
    "provider.profile.manage",
    "provider.verification.submit",
    "provider.jobs.browse",
    "provider.proposals.manage",
    "provider.engagements.manage",
    "provider.engagements.work",
  ],
  provider_manager: [
    "org.view",
    "provider.jobs.browse",
    "provider.proposals.manage",
    "provider.engagements.manage",
    "provider.engagements.work",
  ],
  provider_technician: ["org.view", "provider.engagements.work"],
};

export const GRANT_CAPABILITIES: Record<MemberGrant, readonly Capability[]> = {
  clearance_authority: CLEARANCE,
  approval_limit: ["parts.approve"],
  marketplace_buyer: ["marketplace.post", "marketplace.accept"],
};

/** Which roles may hold each grant (drivers: no purchasing/clearance/marketplace; technicians: no marketplace). */
export const GRANT_ELIGIBLE_ROLES: Record<MemberGrant, readonly MemberRole[]> = {
  clearance_authority: ["administrator", "fleet_manager", "technician"],
  approval_limit: ["owner", "administrator", "fleet_manager", "technician", "finance"],
  marketplace_buyer: ["administrator", "fleet_manager", "finance"],
};

export const ROLES_BY_KIND: Record<OrganisationKind, readonly MemberRole[]> = {
  company: COMPANY_ROLES,
  marketplace_customer: MARKETPLACE_CUSTOMER_ROLES,
  provider: PROVIDER_ROLES,
};

export const OWNER_ROLE_BY_KIND: Record<OrganisationKind, MemberRole> = {
  company: "owner",
  marketplace_customer: "account_owner",
  provider: "provider_owner",
};

export type Portal = "customer" | "provider" | "admin";

export const PORTAL_FOR_KIND: Record<OrganisationKind, Exclude<Portal, "admin">> = {
  company: "customer",
  marketplace_customer: "customer",
  provider: "provider",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  fleet_manager: "Fleet Manager",
  technician: "Technician",
  driver_operator: "Driver or Operator",
  finance: "Finance",
  viewer: "Viewer",
  account_owner: "Account Owner",
  job_manager: "Job Manager",
  provider_owner: "Provider Owner",
  provider_manager: "Provider Manager",
  provider_technician: "Provider Technician",
};

export const GRANT_LABELS: Record<MemberGrant, string> = {
  clearance_authority: "Clearance Authority",
  approval_limit: "Approval Limit",
  marketplace_buyer: "Marketplace Buyer",
};

export const KIND_LABELS: Record<OrganisationKind, string> = {
  company: "Company organisation",
  marketplace_customer: "Marketplace-only customer",
  provider: "Provider account",
};

export function roleIsValidForKind(role: MemberRole, kind: OrganisationKind): boolean {
  return ROLES_BY_KIND[kind].includes(role);
}

export function grantIsValidForRole(grant: MemberGrant, role: MemberRole): boolean {
  return GRANT_ELIGIBLE_ROLES[grant].includes(role);
}

export function capabilitiesFor(role: MemberRole, grants: readonly MemberGrant[] = []): Set<Capability> {
  const caps = new Set<Capability>(ROLE_CAPABILITIES[role]);
  for (const g of grants) for (const c of GRANT_CAPABILITIES[g]) caps.add(c);
  return caps;
}

/** UI helper. Never a security decision: the database re-checks every action. */
export function can(capabilities: ReadonlySet<string> | readonly string[], capability: Capability): boolean {
  return Array.isArray(capabilities)
    ? capabilities.includes(capability)
    : (capabilities as ReadonlySet<string>).has(capability);
}
