/**
 * HVEMS commercial rules — SoW §5 (all Confirmed unless marked).
 * Money is always integer AUD cents. Prices are GST-inclusive final prices.
 * Defaults mirror `platform_settings`; pass live settings where available.
 */

export type Cents = number;

export interface PricingSettings {
  fleetFreeAssets: number;
  fleetPerAssetCents: Cents;
  providerSubscriptionCents: Cents;
  connectionFeeStandardCents: Cents;
  connectionFeeUrgentCents: Cents;
  assetsPerWaiver: number;
  waiverQualifyingDays: number;
  gstRegistered: boolean;
}

export const DEFAULT_PRICING: PricingSettings = Object.freeze({
  fleetFreeAssets: 5,
  fleetPerAssetCents: 3000,
  providerSubscriptionCents: 9900,
  connectionFeeStandardCents: 2900,
  connectionFeeUrgentCents: 4900,
  assetsPerWaiver: 10,
  waiverQualifyingDays: 14,
  gstRegistered: false,
});

function assertCount(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${label} must be a non-negative integer`);
}

/** §5.2: monthly fleet subscription = max(total billable assets − 5, 0) × $30 */
export function fleetSubscriptionCents(billableAssets: number, pricing: PricingSettings = DEFAULT_PRICING): Cents {
  assertCount(billableAssets, "billableAssets");
  return Math.max(billableAssets - pricing.fleetFreeAssets, 0) * pricing.fleetPerAssetCents;
}

export interface AssetCountEvent {
  occurredAt: Date;
  delta: 1 | -1;
}

/**
 * §5.2: billable assets for a month = the highest number of current assets
 * held at any time in that month. `openingCount` is the count at the start of
 * the period; events must fall inside [start, end).
 */
export function highestAssetCount(openingCount: number, events: readonly AssetCountEvent[]): number {
  assertCount(openingCount, "openingCount");
  let current = openingCount;
  let highest = openingCount;
  for (const e of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    current += e.delta;
    if (current < 0) throw new RangeError("asset count cannot go below zero");
    highest = Math.max(highest, current);
  }
  return highest;
}

export interface FleetInvoiceInput {
  highestCount: number;
  /** True for the QLD calendar month in which the company first went above the free allowance (once per company). */
  isIntroductoryMonth: boolean;
}

/** Fleet charge for one billing month (charged in arrears on the 1st). */
export function fleetMonthlyChargeCents(input: FleetInvoiceInput, pricing: PricingSettings = DEFAULT_PRICING): Cents {
  if (input.isIntroductoryMonth) return 0;
  return fleetSubscriptionCents(input.highestCount, pricing);
}

export type JobUrgency = "standard" | "urgent";

export interface ConnectionFees {
  posterCents: Cents;
  providerCents: Cents;
}

/**
 * §5.4: each liable party (job poster and provider) pays one connection fee
 * fixed by the job's urgency at posting. Follow-up engagements with the same
 * provider for the same work within 30 days carry no fee for either party.
 */
export function connectionFees(
  urgency: JobUrgency,
  opts: { isFollowUpWithin30Days?: boolean } = {},
  pricing: PricingSettings = DEFAULT_PRICING,
): ConnectionFees {
  if (opts.isFollowUpWithin30Days) return { posterCents: 0, providerCents: 0 };
  const fee = urgency === "urgent" ? pricing.connectionFeeUrgentCents : pricing.connectionFeeStandardCents;
  return { posterCents: fee, providerCents: fee };
}

/** §5.5: monthly company waivers = floor(eligible company vehicles and equipment ÷ 10) */
export function monthlyWaiverAllowance(eligibleAssets: number, pricing: PricingSettings = DEFAULT_PRICING): number {
  assertCount(eligibleAssets, "eligibleAssets");
  return Math.floor(eligibleAssets / pricing.assetsPerWaiver);
}

const DAY_MS = 86_400_000;

/** §5.5: an asset counts once it has been current in the register for 14 days. */
export function isWaiverQualifyingAsset(
  asset: { becameCurrentAt: Date; archivedAt: Date | null },
  asOf: Date,
  pricing: PricingSettings = DEFAULT_PRICING,
): boolean {
  if (asset.archivedAt && asset.archivedAt <= asOf) return false;
  return asOf.getTime() - asset.becameCurrentAt.getTime() >= pricing.waiverQualifyingDays * DAY_MS;
}

/**
 * §5.5: the allowance never goes down during a month; when the qualifying count
 * reaches a new complete group of ten, extra waivers are added straight away.
 * Returns how many waivers to add now.
 */
export function waiverTopUp(alreadyIssuedThisMonth: number, qualifyingAssets: number, pricing: PricingSettings = DEFAULT_PRICING): number {
  return Math.max(monthlyWaiverAllowance(qualifyingAssets, pricing) - alreadyIssuedThisMonth, 0);
}

/**
 * §5.5 cancellations: a restored waiver goes back to the month it came from if
 * that month is still current; otherwise to the current month (expiring at its end).
 */
export function waiverRestorationMonth(originMonth: string, currentMonth: string): string {
  return originMonth === currentMonth ? originMonth : currentMonth;
}

/**
 * §5.9: prices are GST-inclusive. While HVEMS is not registered no GST is
 * shown; once registered, GST is one-eleventh of the price.
 */
export function gstComponentCents(priceCents: Cents, registered: boolean): Cents {
  if (!registered) return 0;
  return Math.round(priceCents / 11);
}

/**
 * §5.3 founding-provider waiver: providers verified before public launch or
 * within 90 days after it pay no subscription for 3 months, counted from
 * public launch or verification, whichever is later. Returns the date the
 * waiver ends, `null` if not eligible, or "pending_launch" before launch.
 */
export function foundingProviderWaiverEnd(verifiedAt: Date, publicLaunchAt: Date | null): Date | null | "pending_launch" {
  if (!publicLaunchAt) return "pending_launch";
  const cutoff = new Date(publicLaunchAt.getTime() + 90 * DAY_MS);
  if (verifiedAt > cutoff) return null;
  const start = verifiedAt > publicLaunchAt ? verifiedAt : publicLaunchAt;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 3);
  return end;
}

/** Free-tier member-login limit (§5.2, D-05). */
export function canAddMemberLogin(
  input: { currentAssets: number; activeMembers: number; pendingInvitations?: number },
  limits: { freeAssets: number; memberLoginLimit: number } = { freeAssets: 5, memberLoginLimit: 5 },
): boolean {
  if (input.currentAssets > limits.freeAssets) return true;
  return input.activeMembers + (input.pendingInvitations ?? 0) < limits.memberLoginLimit;
}

/** §5.2 consent: needed before the sixth current asset is saved. */
export function requiresFleetConsent(currentAssetsBeforeAdd: number, adding: number, hasConsent: boolean, pricing: PricingSettings = DEFAULT_PRICING): boolean {
  return !hasConsent && currentAssetsBeforeAdd + adding > pricing.fleetFreeAssets;
}

export function formatAud(cents: Cents): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}
