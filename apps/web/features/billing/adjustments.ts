import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Carries out approved refunds and credits in Stripe (SoW §5.8). The database decides
 * what may be refunded and who approved it; this only moves the money and records the
 * result. One idempotency key per adjustment, so a retry never refunds twice.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

interface Claimed {
  id: string;
  number: number;
  organisation_id: string;
  organisation_name: string;
  kind: "refund" | "credit";
  amount_cents: number;
  reason: string;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  payment_intent: string | null;
}

async function rpc<T>(db: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function carryOut(stripe: Stripe, a: Claimed): Promise<string> {
  const key = `hvems-adjustment-${a.id}`;
  const metadata = { hvems_adjustment_id: a.id, hvems_adjustment_number: String(a.number), organisation_id: a.organisation_id };
  if (a.kind === "credit") {
    if (!a.stripe_customer_id) throw new Error("This organisation has no Stripe customer yet (no card has been added)");
    // A negative balance is a credit: Stripe takes it off the next invoice.
    const tx = await stripe.customers.createBalanceTransaction(
      a.stripe_customer_id,
      { amount: -a.amount_cents, currency: "aud", description: `HVEMS credit ${a.number}: ${a.reason}`.slice(0, 350), metadata },
      { idempotencyKey: key },
    );
    return tx.id;
  }
  let paymentIntent = a.payment_intent;
  if (!paymentIntent && a.stripe_invoice_id) {
    const invoice = await stripe.invoices.retrieve(a.stripe_invoice_id);
    const pi = (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
    paymentIntent = typeof pi === "string" ? pi : (pi?.id ?? null);
    if (!paymentIntent) {
      const charge = (invoice as unknown as { charge?: string | { id: string } | null }).charge;
      const chargeId = typeof charge === "string" ? charge : charge?.id;
      if (chargeId) {
        const refund = await stripe.refunds.create({ charge: chargeId, amount: a.amount_cents, reason: "requested_by_customer", metadata }, { idempotencyKey: key });
        return refund.id;
      }
    }
  }
  if (!paymentIntent) throw new Error("No Stripe payment found to refund");
  const refund = await stripe.refunds.create({ payment_intent: paymentIntent, amount: a.amount_cents, reason: "requested_by_customer", metadata }, { idempotencyKey: key });
  return refund.id;
}

/** Carry out one adjustment (right after it is requested or approved) or any approved ones left over. */
export async function processAdjustments(id?: string, existing?: { db: Admin; stripe: Stripe }): Promise<{ completed: number; failed: number; lastError?: string }> {
  const db = existing?.db ?? createSupabaseAdminClient();
  const stripe = existing?.stripe ?? getStripe();
  const rows = await rpc<Claimed[]>(db, "claim_billing_adjustments", { p_id: id ?? null, p_limit: 20 });
  let completed = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const a of rows ?? []) {
    try {
      const ref = await carryOut(stripe, a);
      await rpc(db, "complete_billing_adjustment", { p_id: a.id, p_ok: true, p_stripe_ref: ref, p_error: null });
      completed++;
    } catch (e) {
      lastError = (e as Error).message;
      await rpc(db, "complete_billing_adjustment", { p_id: a.id, p_ok: false, p_stripe_ref: null, p_error: lastError });
      failed++;
    }
  }
  return { completed, failed, lastError };
}
