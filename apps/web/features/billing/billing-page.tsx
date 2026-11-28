import { can } from "@hvems/permissions";
import { fleetSubscriptionCents, formatAud } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { FormAlert } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import type { OrgContext } from "@/lib/session";
import { stripePublishableKey, stripeServerAvailability } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CardManager, type SavedCard } from "./card-manager";
import { FleetConsentButton } from "./consent";

interface InvoiceRow {
  id: string;
  period_start: string;
  description: string;
  amount_cents: number;
  gst_cents: number;
  status: "sending" | "open" | "paid" | "failed" | "void";
  number: string | null;
  hosted_url: string | null;
  pdf_url: string | null;
  last_error: string | null;
}

const INVOICE_STATUS: Record<InvoiceRow["status"], { label: string; tone: "green" | "amber" | "red" | "grey" }> = {
  sending: { label: "Processing", tone: "grey" },
  open: { label: "Due", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  failed: { label: "Payment failed", tone: "red" },
  void: { label: "Cancelled", tone: "grey" },
};
const MONTH = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

const DATE = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Australia/Brisbane" });

/** Billing (CS-34..39): what the organisation pays, its saved cards and, for companies, the fleet subscription consent. */
export async function BillingPage({ ctx }: { ctx: OrgContext }) {
  const db = await createSupabaseServerClient();
  const orgId = ctx.context.organisation_id;
  const kind = ctx.context.kind;
  const canManage = can(ctx.capabilities, "org.billing.manage");

  const [{ data: cards }, { data: settings }, assets, { data: consent }, { data: invoiceRows }] = await Promise.all([
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
    db
      .from("billing_invoices" as never)
      .select("id, period_start, description, amount_cents, gst_cents, status, number, hosted_url, pdf_url, last_error")
      .eq("organisation_id" as never, orgId as never)
      .neq("status" as never, "draft" as never)
      .order("period_start" as never, { ascending: false })
      .limit(24),
  ]);
  const invoices = (invoiceRows ?? []) as unknown as InvoiceRow[];
  // SoW 5.5: one waiver per 10 assets current for 14+ days, each month (connection fees on the company side).
  const waivers =
    kind === "company"
      ? await (db.rpc as unknown as (f: string, a: object) => Promise<{ data: { available: number; used: number; reserved: number; allowance: number }[] | null }>)(
          "company_waiver_balance",
          { p_organisation_id: orgId },
        )
          .then((r) => r.data?.[0] ?? null)
          .catch(() => null)
      : null;

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
          {
            label: "Connection fee waivers",
            value: waivers
              ? waivers.allowance
                ? `${waivers.available} of ${waivers.allowance} left this month`
                : "None this month: one for every 10 assets in your register for 14 days or more"
              : "—",
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

      <Card className="mt-5">
        <CardHeader title="Invoices" description="Charged to the default card on the 1st for the month before." />
        <CardBody className="pt-0">
          {invoices.length ? (
            <ul className="flex flex-col divide-y divide-stroke rounded-[10px] border border-stroke text-[14px]">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-40 font-medium text-ink">{MONTH.format(new Date(i.period_start))}</span>
                  <span className="flex-1 text-ink-subtle">{i.description}</span>
                  <span className="font-medium text-ink">{formatAud(i.amount_cents)}</span>
                  <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                  {i.pdf_url ? (
                    <a href={i.pdf_url} target="_blank" rel="noreferrer" className="text-link hover:underline">
                      {i.number ? `Invoice ${i.number}` : "Invoice"}
                    </a>
                  ) : null}
                  {i.status === "failed" && i.hosted_url ? (
                    <a href={i.hosted_url} target="_blank" rel="noreferrer" className="font-semibold text-link hover:underline">
                      Pay now
                    </a>
                  ) : null}
                  {i.status === "failed" && i.last_error ? <span className="w-full text-[13px] text-danger">{i.last_error}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-subtle">No invoices yet.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
