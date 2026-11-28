import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeServerAvailability } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processAdjustments } from "@/features/billing/adjustments";
import { cleanUpFeeAttempts } from "@/features/billing/connection-fees";

/**
 * Turns monthly invoice drafts into Stripe invoices charged to the default card (CS-34/35/39),
 * and releases or refunds connection-fee holds left by acceptances that didn't complete (ADR-006).
 * Called by pg_cron + pg_net with the same shared secret as the email dispatch. The database
 * decides what is owed (prepare_monthly_invoices); this route only collects it. Each draft uses
 * idempotency keys from its own id, so a retry never creates a second invoice or charge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Draft {
  id: string;
  organisation_id: string;
  organisation_name: string;
  stripe_customer_id: string | null;
  kind: "fleet" | "provider";
  period_start: string;
  description: string;
  amount_cents: number;
  gst_cents: number;
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.EMAIL_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

async function send(stripe: Stripe, d: Draft): Promise<{ outcome: "open" | "paid" | "failed"; invoice?: Stripe.Invoice; error?: string }> {
  if (!d.stripe_customer_id) return { outcome: "failed", error: "No card on file. Add a card under Billing." };
  const invoice = await stripe.invoices.create(
    {
      customer: d.stripe_customer_id,
      collection_method: "charge_automatically",
      auto_advance: true,
      currency: "aud",
      description: d.description,
      pending_invoice_items_behavior: "exclude",
      footer: d.gst_cents > 0 ? `Total includes GST of ${aud(d.gst_cents)}.` : undefined,
      metadata: { hvems_invoice_id: d.id, organisation_id: d.organisation_id, kind: d.kind, period_start: d.period_start },
    },
    { idempotencyKey: `hvems-invoice-${d.id}` },
  );
  if (!invoice.lines.data.length) {
    await stripe.invoiceItems.create(
      { customer: d.stripe_customer_id, invoice: invoice.id, amount: d.amount_cents, currency: "aud", description: d.description },
      { idempotencyKey: `hvems-invoice-item-${d.id}` },
    );
  }
  let current = invoice.status === "draft" ? await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: true }) : invoice;
  if (current.status === "paid") return { outcome: "paid", invoice: current };
  try {
    current = await stripe.invoices.pay(current.id!, {}, { idempotencyKey: `hvems-invoice-pay-${d.id}` });
    return { outcome: current.status === "paid" ? "paid" : "open", invoice: current };
  } catch (e) {
    // Declined: Stripe keeps retrying on its schedule; the webhook records a later success.
    const err = e as { message?: string };
    return { outcome: "failed", invoice: current, error: err.message ?? "The card was declined" };
  }
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const available = stripeServerAvailability();
  if (!available.ok) return NextResponse.json({ error: available.reason }, { status: 503 });

  const db = createSupabaseAdminClient();
  const stripe = getStripe();
  const { data, error } = await db.rpc("claim_draft_invoices", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = { claimed: 0, paid: 0, open: 0, failed: 0 };
  for (const d of (data ?? []) as Draft[]) {
    results.claimed++;
    let r: Awaited<ReturnType<typeof send>>;
    try {
      r = await send(stripe, d);
    } catch (e) {
      // Network or Stripe error before the charge: leave it to be claimed again later.
      await db.from("billing_invoices").update({ status: "draft", last_error: String((e as Error).message).slice(0, 1000) }).eq("id", d.id).eq("status", "sending");
      continue;
    }
    results[r.outcome]++;
    await db.rpc("record_invoice_outcome", {
      p_id: d.id,
      p_stripe_invoice_id: r.invoice?.id ?? null,
      p_outcome: r.outcome,
      p_number: r.invoice?.number ?? null,
      p_hosted_url: r.invoice?.hosted_invoice_url ?? null,
      p_pdf_url: r.invoice?.invoice_pdf ?? null,
      p_error: r.error ?? null,
    });
  }
  // Connection fees: release holds and refund fees on attempts that didn't complete.
  const fees = await cleanUpFeeAttempts(db, stripe).catch((e: Error) => ({ error: e.message }));
  // Refunds and credits approved in the console that haven't gone through yet.
  const adjustments = await processAdjustments(undefined, { db, stripe }).catch((e: Error) => ({ error: e.message }));
  return NextResponse.json({ ...results, fees, adjustments });
}
