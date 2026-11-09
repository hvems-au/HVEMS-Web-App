import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  canAddMemberLogin,
  connectionFees,
  fleetMonthlyChargeCents,
  fleetSubscriptionCents,
  foundingProviderWaiverEnd,
  gstComponentCents,
  highestAssetCount,
  isWaiverQualifyingAsset,
  monthlyWaiverAllowance,
  requiresFleetConsent,
  waiverRestorationMonth,
  waiverTopUp,
} from "./billing";

const d = (s: string) => new Date(s);

describe("fleet subscription (SoW §5.2 table)", () => {
  it.each([
    [3, 0],
    [5, 0],
    [6, 3000],
    [10, 15000],
    [20, 45000],
    [50, 135000],
  ])("%i assets → %i cents", (assets, cents) => {
    expect(fleetSubscriptionCents(assets)).toBe(cents);
  });

  it("adding a sixth asset charges one asset only, never all assets", () => {
    expect(fleetSubscriptionCents(6) - fleetSubscriptionCents(5)).toBe(3000);
  });

  it("rejects negative or fractional counts", () => {
    expect(() => fleetSubscriptionCents(-1)).toThrow(RangeError);
    expect(() => fleetSubscriptionCents(2.5)).toThrow(RangeError);
  });
});

describe("billing month uses the highest count (SoW §5.2 worked example)", () => {
  it("November: 8 → +2 on 12 Nov → archive 1 on 20 Nov ⇒ highest 10 ⇒ $150", () => {
    const highest = highestAssetCount(8, [
      { occurredAt: d("2026-11-12T01:00:00Z"), delta: 1 },
      { occurredAt: d("2026-11-12T01:05:00Z"), delta: 1 },
      { occurredAt: d("2026-11-20T03:00:00Z"), delta: -1 },
    ]);
    expect(highest).toBe(10);
    expect(fleetMonthlyChargeCents({ highestCount: highest, isIntroductoryMonth: false })).toBe(15000);
  });

  it("December: 9 throughout ⇒ $120", () => {
    expect(fleetMonthlyChargeCents({ highestCount: highestAssetCount(9, []), isIntroductoryMonth: false })).toBe(12000);
  });

  it("the introductory month is free", () => {
    expect(fleetMonthlyChargeCents({ highestCount: 12, isIntroductoryMonth: true })).toBe(0);
  });
});

describe("connection fees (SoW §5.4)", () => {
  it("standard: $29 each, $58 total", () => {
    expect(connectionFees("standard")).toEqual({ posterCents: 2900, providerCents: 2900 });
  });
  it("urgent: $49 each, $98 total", () => {
    expect(connectionFees("urgent")).toEqual({ posterCents: 4900, providerCents: 4900 });
  });
  it("follow-up within 30 days: no fee for either party", () => {
    expect(connectionFees("urgent", { isFollowUpWithin30Days: true })).toEqual({ posterCents: 0, providerCents: 0 });
  });
});

describe("monthly company waivers (SoW §5.5 table)", () => {
  it.each([
    [5, 0],
    [9, 0],
    [10, 1],
    [20, 2],
    [50, 5],
  ])("%i eligible → %i waivers", (n, w) => expect(monthlyWaiverAllowance(n)).toBe(w));

  it("an asset qualifies after 14 days current", () => {
    const asset = { becameCurrentAt: d("2026-11-01T00:00:00Z"), archivedAt: null };
    expect(isWaiverQualifyingAsset(asset, d("2026-11-14T23:59:59Z"))).toBe(false);
    expect(isWaiverQualifyingAsset(asset, d("2026-11-15T00:00:00Z"))).toBe(true);
    expect(isWaiverQualifyingAsset({ ...asset, archivedAt: d("2026-11-20T00:00:00Z") }, d("2026-11-21T00:00:00Z"))).toBe(false);
  });

  it("the allowance only ever increases during a month", () => {
    expect(waiverTopUp(1, 20)).toBe(1);
    expect(waiverTopUp(2, 9)).toBe(0);
  });

  it("restored waivers return to their month if still current, else the current month", () => {
    expect(waiverRestorationMonth("2026-11", "2026-11")).toBe("2026-11");
    expect(waiverRestorationMonth("2026-10", "2026-11")).toBe("2026-11");
  });
});

describe("worked examples (SoW §5.6)", () => {
  it("Example 1: 20 vehicles, four engagements S,U,S,S ⇒ company pays $508 for November", () => {
    const waivers = monthlyWaiverAllowance(20);
    const jobs = ["standard", "urgent", "standard", "standard"] as const;
    let remaining = waivers;
    let companyFees = 0;
    for (const j of jobs) {
      if (remaining > 0) remaining -= 1;
      else companyFees += connectionFees(j).posterCents;
    }
    expect(waivers).toBe(2);
    expect(companyFees).toBe(5800);
    expect(companyFees + fleetSubscriptionCents(20)).toBe(50800);
    expect(jobs.reduce((s, j) => s + connectionFees(j).providerCents, 0)).toBe(13600);
  });

  it("Example 2: marketplace-only urgent job ⇒ $49 + $49", () => {
    expect(connectionFees("urgent")).toEqual({ posterCents: 4900, providerCents: 4900 });
  });

  it("Example 3: 8 vehicles ⇒ no waivers, $90/month", () => {
    expect(monthlyWaiverAllowance(8)).toBe(0);
    expect(fleetSubscriptionCents(8)).toBe(9000);
  });

  it("Example 4: 50 vehicles + 12 excavators ⇒ $1,710/month and 6 waivers", () => {
    expect(fleetSubscriptionCents(62)).toBe(171000);
    expect(monthlyWaiverAllowance(62)).toBe(6);
  });
});

describe("GST (SoW §5.9 table)", () => {
  it("no GST while unregistered", () => expect(gstComponentCents(3000, false)).toBe(0));
  it.each([
    [3000, 273],
    [9900, 900],
    [2900, 264],
    [4900, 445],
  ])("GST included in %i once registered = %i", (price, gst) => expect(gstComponentCents(price, true)).toBe(gst));
});

describe("founding-provider waiver (SoW §5.3, D-04)", () => {
  const launch = d("2027-03-01T00:00:00Z");
  it("verified before launch: 3 months from launch", () => {
    expect(foundingProviderWaiverEnd(d("2027-01-10T00:00:00Z"), launch)).toEqual(d("2027-06-01T00:00:00Z"));
  });
  it("verified within 90 days after launch: 3 months from verification", () => {
    expect(foundingProviderWaiverEnd(d("2027-04-15T00:00:00Z"), launch)).toEqual(d("2027-07-15T00:00:00Z"));
  });
  it("verified more than 90 days after launch: not eligible", () => {
    expect(foundingProviderWaiverEnd(d("2027-06-15T00:00:00Z"), launch)).toBeNull();
  });
  it("before launch the end date cannot be known yet", () => {
    expect(foundingProviderWaiverEnd(d("2027-01-10T00:00:00Z"), null)).toBe("pending_launch");
  });
});

describe("free tier (SoW §5.2, D-05)", () => {
  it("five member logins while five or fewer assets", () => {
    expect(canAddMemberLogin({ currentAssets: 5, activeMembers: 4 })).toBe(true);
    expect(canAddMemberLogin({ currentAssets: 5, activeMembers: 5 })).toBe(false);
    expect(canAddMemberLogin({ currentAssets: 5, activeMembers: 4, pendingInvitations: 1 })).toBe(false);
    expect(canAddMemberLogin({ currentAssets: 6, activeMembers: 40 })).toBe(true);
  });
  it("consent is needed before the sixth asset", () => {
    expect(requiresFleetConsent(5, 1, false)).toBe(true);
    expect(requiresFleetConsent(4, 1, false)).toBe(false);
    expect(requiresFleetConsent(5, 1, true)).toBe(false);
  });
});

describe("defaults mirror platform_settings seed", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261109000100_foundation.sql"), "utf8");
  const setting = (key: string) => {
    const m = sql.match(new RegExp(`\\('${key.replace(/\./g, "\\.")}',\\s*'([^']*)'`));
    return m?.[1];
  };
  it.each([
    ["pricing.fleet_free_assets", DEFAULT_PRICING.fleetFreeAssets],
    ["pricing.fleet_per_asset_cents", DEFAULT_PRICING.fleetPerAssetCents],
    ["pricing.provider_subscription_cents", DEFAULT_PRICING.providerSubscriptionCents],
    ["pricing.connection_fee_standard_cents", DEFAULT_PRICING.connectionFeeStandardCents],
    ["pricing.connection_fee_urgent_cents", DEFAULT_PRICING.connectionFeeUrgentCents],
    ["waivers.assets_per_waiver", DEFAULT_PRICING.assetsPerWaiver],
    ["waivers.qualifying_days", DEFAULT_PRICING.waiverQualifyingDays],
  ])("%s", (key, value) => expect(Number(setting(key))).toBe(value));
});
