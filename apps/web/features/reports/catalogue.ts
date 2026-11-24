/** The fifteen standard reports (SoW 3.8, spec RPT-02), with metric definitions (RPT-06). */
export type ReportKey =
  | "asset-register"
  | "condition-history"
  | "inspections"
  | "defects"
  | "deferred-defects"
  | "clearances"
  | "services"
  | "work-orders"
  | "maintenance-cost"
  | "parts"
  | "fuel"
  | "notices"
  | "marketplace"
  | "connection-fees"
  | "subscription-billing";

export type ReportFilter = "date" | "site" | "client" | "asset" | "class" | "status";

export type ReportDef = {
  key: ReportKey;
  number: number;
  title: string;
  group: "Fleet" | "Safety" | "Maintenance" | "Costs" | "Marketplace and billing";
  summary: string;
  /** What each row is and how its figures are worked out (RPT-06). */
  definition: string;
  /** What the date range filters on. */
  dateLabel?: string;
  filters: ReportFilter[];
  /** Cost reports need assets.costs.view as well as reports.view. */
  costs?: boolean;
  /** Not built yet: says when it arrives (no made-up data). */
  unavailable?: string;
};

const ALL: ReportFilter[] = ["date", "site", "client", "asset", "class", "status"];

export const REPORTS: ReportDef[] = [
  {
    key: "asset-register",
    number: 1,
    title: "Asset register",
    group: "Fleet",
    summary: "Every piece of equipment with its details, owner, site, readings and condition.",
    definition: "One row per piece of equipment, current and archived. Condition is worked out from open safety causes; readings are the latest accepted ones.",
    dateLabel: "Added",
    filters: ALL,
  },
  {
    key: "condition-history",
    number: 2,
    title: "Asset condition history",
    group: "Fleet",
    summary: "Every change of condition, with what caused it and when.",
    definition: "One row per condition change (append-only history). Status filters on the new condition.",
    dateLabel: "Changed",
    filters: ALL,
  },
  {
    key: "inspections",
    number: 3,
    title: "Inspections done and missed",
    group: "Safety",
    summary: "Pre-starts submitted, and pre-starts that were due but not done.",
    definition:
      "One row per submitted pre-start (dated when submitted) and one per missed period (dated at the start of the period). Missed periods show whether a manager marked them not used or missed.",
    dateLabel: "Date",
    filters: ALL,
  },
  {
    key: "defects",
    number: 4,
    title: "Defects by age, category and asset",
    group: "Safety",
    summary: "All defects with severity, kind of issue, status and age.",
    definition: "One row per defect. Age is whole days from reported to closed, or to today if still open.",
    dateLabel: "Reported",
    filters: ALL,
  },
  {
    key: "deferred-defects",
    number: 5,
    title: "Deferred defects",
    group: "Safety",
    summary: "Minor defects whose repair was deferred, who approved it and why.",
    definition: "One row per defect with a deferred repair date. Approver and time are recorded by the database when the deferral is made.",
    dateLabel: "Deferred",
    filters: ALL,
  },
  {
    key: "clearances",
    number: 6,
    title: "Clearances and return-to-service decisions",
    group: "Safety",
    summary: "Defects cleared as repaired, and each return to service with its note and evidence.",
    definition: "One row per repaired defect (dated when cleared) and one per return-to-service decision. Evidence is the number of files attached.",
    dateLabel: "Date",
    filters: ["date", "site", "client", "asset", "class"],
  },
  {
    key: "services",
    number: 7,
    title: "Service due and history",
    group: "Maintenance",
    summary: "Each service plan's next due and status, and each service done through a closed work order.",
    definition:
      "Plan rows show the next due (date, kilometres or hours) and status today. Service rows are closed work orders linked to a plan, dated when closed.",
    dateLabel: "Due or done",
    filters: ALL,
  },
  {
    key: "work-orders",
    number: 8,
    title: "Work orders and time to complete",
    group: "Maintenance",
    summary: "Every work order with who did it, status, labour hours and days to complete.",
    definition: "One row per work order. Days to complete is from created to completed (whole days); blank if not completed.",
    dateLabel: "Created",
    filters: ALL,
  },
  {
    key: "maintenance-cost",
    number: 9,
    title: "Maintenance cost by asset, job, type and client",
    group: "Costs",
    summary: "Every cost line: parts fitted, labour and outside work on closed jobs, and fuel.",
    definition:
      "One row per cost line, each posted once from its source. Corrections and reopened jobs appear as negative lines, so totals are always right. Amounts as entered (GST included unless marked).",
    dateLabel: "Posted",
    filters: ["date", "site", "client", "asset", "class", "status"],
    costs: true,
  },
  {
    key: "parts",
    number: 10,
    title: "Parts requests, purchasing and receiving",
    group: "Maintenance",
    summary: "Each requested part with its request, order, delivery and fitting quantities.",
    definition:
      "One row per request line. Outstanding is ordered quantity less received. Approved and actual prices show only to people who can see costs.",
    dateLabel: "Requested",
    filters: ALL,
  },
  {
    key: "fuel",
    number: 11,
    title: "Fuel and usage",
    group: "Costs",
    summary: "Every fuel fill with its reading, supplier and (for cost readers) cost.",
    definition: "One row per current fuel record; corrected records show the corrected values. Cost shows only to people who can see costs.",
    dateLabel: "Filled",
    filters: ["date", "site", "client", "asset", "class"],
  },
  {
    key: "notices",
    number: 12,
    title: "Regulator notices",
    group: "Safety",
    summary: "Notices issued by regulators, with severity, clear-by date and clearance.",
    definition: "One row per notice, dated when issued.",
    dateLabel: "Issued",
    filters: ALL,
  },
  {
    key: "marketplace",
    number: 13,
    title: "Marketplace jobs, proposals and engagements",
    group: "Marketplace and billing",
    summary: "Jobs you posted with their proposals and engagement, and (for a company working as a provider) the jobs you quoted on.",
    definition:
      "Posted rows: one per job you posted, with the number of proposals, time to the first proposal, the engaged provider and the engagement status. Quoted rows: one per proposal you submitted, with its price and outcome. Connection fees show as recorded; they are not charged until billing is live.",
    dateLabel: "Posted or quoted",
    filters: ["date", "status"],
  },
  {
    key: "connection-fees",
    number: 14,
    title: "Connection fees and waivers",
    group: "Marketplace and billing",
    summary: "Connection fees charged on engagements and any waivers applied.",
    definition: "One row per connection fee or waiver.",
    filters: ["date", "status"],
    unavailable: "Available with the Service Marketplace and billing (increment 2D).",
  },
  {
    key: "subscription-billing",
    number: 15,
    title: "Subscription billing",
    group: "Marketplace and billing",
    summary: "Monthly fleet subscription charges by billing month.",
    definition: "One row per billing month with billable equipment and the charge.",
    filters: ["date"],
    unavailable: "Available when Stripe billing is connected (increment 2D).",
  },
];

export const reportByKey = (key: string) => REPORTS.find((r) => r.key === key);
