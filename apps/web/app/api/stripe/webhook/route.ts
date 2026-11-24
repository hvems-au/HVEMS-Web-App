import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook (ADR-006). The signature is checked with STRIPE_WEBHOOK_SECRET; each event
 * is stored once by its id, so a repeat delivery does nothing. Card events keep the saved
 * cards in line with Stripe; payment and invoice events arrive with the next billing slices.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function orgForCustomer(db: Admin, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  const id = typeof customer === "string" ? customer : customer?.id;
  if (!id) return null;
  const { data } = await db.from("billing_customers").select("organisation_id").eq("stripe_customer_id", id).maybeSingle();
  return (data?.organisation_id as string | undefined) ?? null;
}

async function saveCard(db: Admin, orgId: string, pm: Stripe.PaymentMethod) {
  const { error } = await db.rpc("record_payment_method", {
    p_organisation_id: orgId,
    p_payment_method_id: pm.id,
    p_brand: pm.card?.brand ?? null,
    p_last4: pm.card?.last4 ?? null,
    p_exp_month: pm.card?.exp_month ?? null,
    p_exp_year: pm.card?.exp_year ?? null,
    p_make_default: false,
    p_actor: null,
  });
  if (error) throw new Error(error.message);
}

async function handle(db: Admin, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "setup_intent.succeeded": {
      const si = event.data.object;
      const orgId = await orgForCustomer(db, si.customer);
      if (!orgId || !si.payment_method) return;
      const pm = typeof si.payment_method === "string" ? await stripe.paymentMethods.retrieve(si.payment_method) : si.payment_method;
      await saveCard(db, orgId, pm);
      return;
    }
    case "payment_method.updated":
    case "payment_method.automatically_updated": {
      const pm = event.data.object;
      const orgId = await orgForCustomer(db, pm.customer);
      if (orgId) await saveCard(db, orgId, pm);
      return;
    }
    case "payment_method.detached": {
      const pm = event.data.object;
      const { error } = await db.rpc("mark_payment_method_detached", { p_payment_method_id: pm.id, p_actor: null });
      if (error) throw new Error(error.message);
      return;
    }
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      const inv = event.data.object;
      if (!inv.metadata?.hvems_invoice_id) return; // Only HVEMS monthly invoices.
      const outcome =
        event.type === "invoice.paid" ? "paid" : event.type === "invoice.finalized" ? "open" : event.type === "invoice.voided" ? "void" : "failed";
      const { error } = await db.rpc("record_invoice_outcome", {
        p_id: null,
        p_stripe_invoice_id: inv.id,
        p_outcome: outcome,
        p_number: inv.number ?? null,
        p_hosted_url: inv.hosted_invoice_url ?? null,
        p_pdf_url: inv.invoice_pdf ?? null,
        p_error: outcome === "failed" ? (inv.last_finalization_error?.message ?? "The card was declined") : null,
      });
      if (error) throw new Error(error.message);
      return;
    }
    default:
      return; // Stored for the record; handled by later slices.
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "not configured" }, { status: 400 });

  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = getStripe();
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const { data: first, error } = await db.rpc("record_stripe_event", { p_id: event.id, p_type: event.type, p_livemode: event.livemode });
  if (error) return NextResponse.json({ error: "could not record event" }, { status: 500 });
  if (!first) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handle(db, stripe, event);
    await db.rpc("finish_stripe_event", { p_id: event.id, p_error: null });
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.rpc("finish_stripe_event", { p_id: event.id, p_error: message });
    // Stripe retries on a non-2xx; a failed event is processed again on the next delivery.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
