import { can } from "@hvems/permissions";
import { fleetSubscriptionCents, formatAud } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { FormAlert } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import type { OrgContext } from "@/lib/session";
import { stripePublishableKey, stripeServerAvailability } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CardManager, type SavedCard } from "./card-manager";
import { FleetConsentButton } from "./consent";

const DATE = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Australia/Brisbane" });

/** Billing (CS-34..39): what the organisation pays, its saved cards and, for companies, the fleet subscription consent. */
export async function BillingPage({ ctx }: { ctx: OrgContext }) {
  const db = await createSupabaseServerClient();
  const orgId = ctx.context.organisation_id;
  const kind = ctx.context.kind;
  const canManage = can(ctx.capabilities, "org.billing.manage");

  const [{ data: cards }, { data: settings }, assets, { data: consent }] = await Promise.all([
    db
      .from("payment_methods")
      .select("stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default")
      .eq("organisation_id", orgId)
      .is("detached_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    db.from("platform_settings").select("key, value").like("key", "pricing.%"),
    kind === "company"
      ? db.from("assets").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).is("archived_at", null)
      : Promise.resolve({ count: 0 }),
    kind === "company"
      ? db.from("fleet_subscription_consents").select("consented_at, price_per_asset_cents").eq("organisation_id", orgId).is("withdrawn_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const setting = (k: string, d: number) => {
    const v = Number(settings?.find((s) => s.key === k)?.value);
    return Number.isFinite(v) ? v : d;
  };
  const pricing = {
    fleetFreeAssets: setting("pricing.fleet_free_assets", 5),
    fleetPerAssetCents: setting("pricing.fleet_per_asset_cents", 3000),
    providerSubscriptionCents: setting("pricing.provider_subscription_cents", 9900),
    connectionFeeStandardCents: setting("pricing.connection_fee_standard_cents", 2900),
    connectionFeeUrgentCents: setting("pricing.connection_fee_urgent_cents", 4900),
  };
  const assetCount = assets.count ?? 0;
  const available = stripeServerAvailability();
  const publishableKey = stripePublishableKey();
  const saved: SavedCard[] = (cards ?? []).map((c) => ({
    id: c.stripe_payment_method_id,
    brand: c.brand,
    last4: c.last4,
    exp_month: c.exp_month,
    exp_year: c.exp_year,
    is_default: c.is_default,
  }));

  const plan =
    kind === "company"
      ? [
          { label: "Current assets", value: String(assetCount) },
          { label: "Free assets", value: `The first ${pricing.fleetFreeAssets}` },
          { label: "Price above that", value: `${formatAud(pricing.fleetPerAssetCents)} per asset per month` },
          {
            label: "This month at today's count",
            value: formatAud(fleetSubscriptionCents(assetCount, { ...pricing, assetsPerWaiver: 10, waiverQualifyingDays: 14, gstRegistered: false })),
          },
        ]
      : kind === "provider"
        ? [{ label: "Provider subscription", value: `${formatAud(pricing.providerSubscriptionCents)} per month` }]
        : [{ label: "Subscription", value: "None: marketplace customers pay connection fees only" }];

  return (
    <>
      <PageHeader title="Billing" description="What you pay HVEMS, your saved cards and invoices" />
      {!available.ok ? (
        <div className="mb-5">
          <FormAlert tone="info">{available.reason} Card changes are unavailable for now.</FormAlert>
        </div>
      ) : available.mode === "test" ? (
        <div className="mb-5">
          <FormAlert tone="info">Test mode: use Stripe test cards such as 4242 4242 4242 4242 with any future expiry and any CVC. Nothing is charged.</FormAlert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your plan" description="Prices include GST where it applies." />
          <CardBody className="pt-0">
            <Dl items={plan} />
            <p className="mt-3 text-[13px] text-ink-subtle">
              Connection fees when a marketplace job is accepted: {formatAud(pricing.connectionFeeStandardCents)} standard, {formatAud(pricing.connectionFeeUrgentCents)} urgent, for
              each party.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cards" description="The default card pays subscriptions and connection fees." />
          <CardBody className="pt-0">
            <CardManager orgId={orgId} cards={saved} publishableKey={publishableKey} canManage={canManage} />
          </CardBody>
        </Card>

        {kind === "company" ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Fleet subscription" description={`Needed before you add asset number ${pricing.fleetFreeAssets + 1}.`} />
            <CardBody className="pt-0 text-[14px]">
              {consent ? (
                <p>
                  Agreed on {DATE.format(new Date(consent.consented_at))} at {formatAud(consent.price_per_asset_cents)} per asset per month above {pricing.fleetFreeAssets}.
                </p>
              ) : !canManage ? (
                <p className="text-ink-subtle">Not agreed yet. The Owner or a Finance member can agree here.</p>
              ) : saved.length === 0 ? (
                <p className="text-ink-subtle">Add a card first, then agree to the fleet subscription here.</p>
              ) : (
                <FleetConsentButton orgId={orgId} perAssetCents={pricing.fleetPerAssetCents} freeAssets={pricing.fleetFreeAssets} priceText={formatAud(pricing.fleetPerAssetCents)} />
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
