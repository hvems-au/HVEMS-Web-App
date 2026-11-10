import type { Capability, OrganisationKind } from "@hvems/permissions";

export type IconName =
  | "dashboard"
  | "equipment"
  | "clients"
  | "sites"
  | "inspections"
  | "defects"
  | "maintenance"
  | "workorders"
  | "schedule"
  | "technicians"
  | "parts"
  | "fuel"
  | "documents"
  | "reports"
  | "marketplace"
  | "jobs"
  | "alerts"
  | "notifications"
  | "team"
  | "audit"
  | "settings"
  | "drivers"
  | "proposals"
  | "engagements"
  | "profile"
  | "billing"
  | "verification"
  | "organisations"
  | "cases";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Shown only if the member holds this capability (UI only; the database enforces access). */
  capability?: Capability;
  /** Stage 2 increment that delivers the module, when not yet built. */
  increment?: "2B" | "2C" | "2D";
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function customerNav(orgId: string, kind: OrganisationKind): NavSection[] {
  const base = `/customer/${orgId}`;
  if (kind === "marketplace_customer") {
    return [
      {
        items: [
          { label: "Dashboard", href: `${base}/dashboard`, icon: "dashboard" },
          { label: "My Jobs", href: `${base}/module/jobs`, icon: "jobs", increment: "2D" },
          { label: "Proposals", href: `${base}/module/proposals`, icon: "proposals", increment: "2D" },
          { label: "Engagements", href: `${base}/module/engagements`, icon: "engagements", increment: "2D" },
          { label: "Notifications", href: `${base}/module/notifications`, icon: "notifications", increment: "2D" },
        ],
      },
      {
        items: [
          { label: "Team", href: `${base}/team`, icon: "team" },
          { label: "Audit History", href: `${base}/audit`, icon: "audit", capability: "audit.view" },
          { label: "Settings", href: `${base}/settings`, icon: "settings" },
        ],
      },
    ];
  }
  return [
    {
      items: [
        { label: "Dashboard", href: `${base}/dashboard`, icon: "dashboard" },
        { label: "Equipment", href: `${base}/equipment`, icon: "equipment" },
        { label: "Clients & Sites", href: `${base}/clients`, icon: "clients", capability: "clients.view" },
        { label: "Inspections", href: `${base}/inspections`, icon: "inspections" },
        { label: "Defects & Safety", href: `${base}/defects`, icon: "defects" },
        { label: "Alerts", href: `${base}/alerts`, icon: "alerts" },
        { label: "Drivers", href: `${base}/drivers`, icon: "drivers", capability: "drivers.manage" },
        { label: "Maintenance", href: `${base}/module/maintenance`, icon: "maintenance", increment: "2C" },
        { label: "Work Orders", href: `${base}/module/work-orders`, icon: "workorders", increment: "2C" },
        { label: "Technicians", href: `${base}/module/technicians`, icon: "technicians", capability: "workforce.manage", increment: "2C" },
        { label: "Parts", href: `${base}/module/parts`, icon: "parts", increment: "2C" },
        { label: "Fuel & Usage", href: `${base}/module/fuel`, icon: "fuel", increment: "2C" },
        { label: "Documents", href: `${base}/module/documents`, icon: "documents", increment: "2C" },
        { label: "Reports", href: `${base}/module/reports`, icon: "reports", capability: "reports.view", increment: "2C" },
        { label: "Marketplace", href: `${base}/module/marketplace`, icon: "marketplace", capability: "marketplace.post", increment: "2D" },
      ],
    },
    {
      items: [
        { label: "Team", href: `${base}/team`, icon: "team" },
        { label: "Audit History", href: `${base}/audit`, icon: "audit", capability: "audit.view" },
        { label: "Settings", href: `${base}/settings`, icon: "settings" },
      ],
    },
  ];
}

export function providerNav(orgId: string): NavSection[] {
  const base = `/provider/${orgId}`;
  return [
    {
      items: [
        { label: "Dashboard", href: `${base}/dashboard`, icon: "dashboard" },
        { label: "Browse Jobs", href: `${base}/module/jobs`, icon: "jobs", capability: "provider.jobs.browse", increment: "2D" },
        { label: "My Proposals", href: `${base}/module/proposals`, icon: "proposals", capability: "provider.proposals.manage", increment: "2D" },
        { label: "Engagements", href: `${base}/module/engagements`, icon: "engagements", increment: "2D" },
        { label: "Verification", href: `${base}/module/verification`, icon: "verification", capability: "provider.verification.submit", increment: "2D" },
        { label: "Subscription", href: `${base}/module/billing`, icon: "billing", capability: "org.billing.view", increment: "2D" },
      ],
    },
    {
      items: [
        { label: "Team", href: `${base}/team`, icon: "team" },
        { label: "Audit History", href: `${base}/audit`, icon: "audit", capability: "audit.view" },
        { label: "Settings", href: `${base}/settings`, icon: "settings" },
      ],
    },
  ];
}

export function adminNav(): NavSection[] {
  return [
    {
      title: "Platform",
      items: [
        { label: "Dashboard", href: "/admin", icon: "dashboard" },
        { label: "Organisations", href: "/admin/organisations", icon: "organisations" },
        { label: "Asset Classes", href: "/admin/asset-classes", icon: "equipment" },
        { label: "Audit History", href: "/admin/audit", icon: "audit" },
        { label: "Settings", href: "/admin/settings", icon: "settings" },
      ],
    },
    {
      title: "Increment 2D",
      items: [
        { label: "Verification", href: "/admin/module/verification", icon: "verification", increment: "2D" },
        { label: "Cases & Disputes", href: "/admin/module/cases", icon: "cases", increment: "2D" },
        { label: "Billing", href: "/admin/module/billing", icon: "billing", increment: "2D" },
        { label: "Moderation", href: "/admin/module/moderation", icon: "marketplace", increment: "2D" },
      ],
    },
  ];
}

export const MODULE_INFO: Record<string, { title: string; increment: "2B" | "2C" | "2D"; scope: string; sow: string }> = {
  inspections: { title: "Inspections", increment: "2B", scope: "Pre-start, inspection and condition forms; versioned templates; frequency, missed inspections and review.", sow: "CS-11, CS-12" },
  defects: { title: "Defects & Safety", increment: "2B", scope: "Defect reports and triage, holds, deferral, two-step clearance and return to service, breakdowns and regulator notices.", sow: "CS-13 – CS-16" },
  alerts: { title: "Alerts", increment: "2B", scope: "Critical alerts with acknowledgement and escalation at 30 minutes and 2 hours.", sow: "CS-16, CS-40" },
  drivers: { title: "Drivers", increment: "2B", scope: "Driver profiles with Driver ID and 6-digit PIN, permitted assets and sites, equipment codes and QR labels.", sow: "CS-10" },
  maintenance: { title: "Maintenance", increment: "2C", scope: "Service plans by date, kilometres or hours, due-soon thresholds and history.", sow: "CS-17" },
  "work-orders": { title: "Work Orders", increment: "2C", scope: "Work orders done internally, by an outside vendor, or through the marketplace; review, closure and reopening.", sow: "CS-18" },
  technicians: { title: "Technicians", increment: "2C", scope: "Technician profiles, qualifications and licences, availability, leave and allocation warnings.", sow: "CS-19" },
  parts: { title: "Parts", increment: "2C", scope: "Parts requests, Approval Limits, purchasing records, receiving and usage.", sow: "CS-20" },
  fuel: { title: "Fuel & Usage", increment: "2C", scope: "Fuel and usage records and maintenance expenditure.", sow: "CS-23" },
  documents: { title: "Documents", increment: "2C", scope: "Private documents and photos with categories, expiry reminders and malware checks.", sow: "CS-22" },
  reports: { title: "Reports", increment: "2C", scope: "The fifteen CSV reports, compliance summary, printable records and full export.", sow: "CS-24" },
  marketplace: { title: "Marketplace", increment: "2D", scope: "Post standard and urgent jobs, compare proposals, accept and pay connection fees, manage engagements.", sow: "CS-26 – CS-33" },
  jobs: { title: "Jobs", increment: "2D", scope: "Marketplace jobs: posting, questions, proposals and engagements.", sow: "CS-26 – CS-32" },
  proposals: { title: "Proposals", increment: "2D", scope: "Proposals, revisions, comparison and acceptance.", sow: "CS-28, CS-29" },
  engagements: { title: "Engagements", increment: "2D", scope: "Engagement workspace, variations, completion, reviews, cancellations and cases.", sow: "CS-31, CS-32" },
  notifications: { title: "Notifications", increment: "2D", scope: "In-app notification list with unread count, email delivery and preferences.", sow: "CS-40" },
  verification: { title: "Verification", increment: "2D", scope: "ABN check, insurance and qualification evidence, Verification Officer review and badges.", sow: "CS-27" },
  billing: { title: "Billing", increment: "2D", scope: "Subscriptions, connection fees, waivers, invoices and Stripe payment methods.", sow: "CS-34 – CS-39" },
  cases: { title: "Cases & Disputes", increment: "2D", scope: "Cases about no-shows, conduct, safety concerns and fees.", sow: "CS-32" },
  moderation: { title: "Moderation", increment: "2D", scope: "Moderation of jobs, messages and reviews.", sow: "CS-04" },
};
