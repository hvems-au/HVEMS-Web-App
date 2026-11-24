"use server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { errorState, type ActionState } from "@/lib/actions";
import { BillingUnavailableError, getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Saved cards (CS-36). The signed-in person's permission is checked by the database
 * (billing_gate) before any Stripe call; card rows are written by the server only,
 * from what Stripe returns, never from what the browser sends.
 */
interface Gate {
  organisation_id: string;
  name: string;
  kind: string;
  contact_email: string | null;
  stripe_customer_id: string | null;
  user_id: string;
}

async function gate(orgId: string): Promise<{ gate: Gate; email: string | null }> {
  const db = await createSupabaseServerClient();
  const [{ data, error }, { data: user }] = await Promise.all([
    db.rpc("billing_gate" as never, { p_organisation_id: orgId } as never),
    db.auth.getUser(),
  ]);
  if (error) throw error;
  return { gate: data as unknown as Gate, email: user.user?.email ?? null };
}

function failure(e: unknown): ActionState<never> {
  if (e instanceof BillingUnavailableError) return { status: "error", code: e.code, message: e.message };
  const s = e as { type?: string; message?: string; code?: string };
  if (typeof s?.type === "string" && s.type.startsWith("Stripe")) {
    return { status: "error", code: s.code ?? "stripe_error", message: s.message ?? "The card couldn't be saved. Try again." };
  }
  return errorState(e);
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) throw error;
  return data;
};

/** The organisation's Stripe customer, created on first use (idempotent per organisation). */
async function ensureCustomer(stripe: Stripe, g: Gate, email: string | null): Promise<string> {
  if (g.stripe_customer_id) return g.stripe_customer_id;
  const customer = await stripe.customers.create(
    {
      name: g.name,
      email: g.contact_email ?? email ?? undefined,
      metadata: { organisation_id: g.organisation_id, organisation_kind: g.kind },
      preferred_locales: ["en-AU"],
    },
    { idempotencyKey: `hvems-customer-${g.organisation_id}` },
  );
  await rpc("record_billing_customer", { p_organisation_id: g.organisation_id, p_customer_id: customer.id, p_livemode: customer.livemode, p_actor: g.user_id });
  // Another tab may have won the race: use whichever customer the database kept.
  const { data } = await createSupabaseAdminClient().from("billing_customers").select("stripe_customer_id").eq("organisation_id", g.organisation_id).single();
  return (data?.stripe_customer_id as string) ?? customer.id;
}

/** Step 1 of adding a card: a SetupIntent the card form confirms in the browser. */
export async function startCardSetupAction(orgId: string): Promise<ActionState<{ clientSecret: string }>> {
  try {
    const stripe = getStripe();
    const { gate: g, email } = await gate(orgId);
    const customer = await ensureCustomer(stripe, g, email);
    const si = await stripe.setupIntents.create({
      customer,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { organisation_id: orgId },
    });
    return { status: "success", data: { clientSecret: si.client_secret! } };
  } catch (e) {
    return failure(e);
  }
}

/** Step 2: after the browser confirmed it, read the result from Stripe and save the card. */
export async function finishCardSetupAction(orgId: string, setupIntentId: string): Promise<ActionState> {
  try {
    if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId)) return { status: "error", code: "invalid", message: "Card setup not recognised" };
    const stripe = getStripe();
    const { gate: g } = await gate(orgId);
    const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
    if (!g.stripe_customer_id || si.customer !== g.stripe_customer_id || si.metadata?.organisation_id !== orgId) {
      return { status: "error", code: "forbidden", message: "This card setup belongs to another account" };
    }
    if (si.status !== "succeeded") return { status: "error", code: "card_not_confirmed", message: "The card wasn't confirmed. Try again." };
    const pm = si.payment_method as Stripe.PaymentMethod;
    await stripe.customers.update(g.stripe_customer_id, { invoice_settings: { default_payment_method: pm.id } });
    await rpc("record_payment_method", {
      p_organisation_id: orgId,
      p_payment_method_id: pm.id,
      p_brand: pm.card?.brand ?? null,
      p_last4: pm.card?.last4 ?? null,
      p_exp_month: pm.card?.exp_month ?? null,
      p_exp_year: pm.card?.exp_year ?? null,
      p_make_default: true,
      p_actor: g.user_id,
    });
    revalidatePath("/", "layout");
    return { status: "success", message: "Card saved" };
  } catch (e) {
    return failure(e);
  }
}

/** A saved card of this organisation, read with the person's own access. */
async function ownCard(orgId: string, paymentMethodId: string) {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("payment_methods")
    .select("stripe_payment_method_id")
    .eq("organisation_id", orgId)
    .eq("stripe_payment_method_id", paymentMethodId)
    .is("detached_at", null)
    .maybeSingle();
  return data?.stripe_payment_method_id ?? null;
}

export async function makeDefaultCardAction(orgId: string, paymentMethodId: string): Promise<ActionState> {
  try {
    const stripe = getStripe();
    const { gate: g } = await gate(orgId);
    const pm = await ownCard(orgId, paymentMethodId);
    if (!pm || !g.stripe_customer_id) return { status: "error", code: "not_found", message: "Card not found" };
    await stripe.customers.update(g.stripe_customer_id, { invoice_settings: { default_payment_method: pm } });
    await rpc("set_default_payment_method_record", { p_organisation_id: orgId, p_payment_method_id: pm, p_actor: g.user_id });
    revalidatePath("/", "layout");
    return { status: "success", message: "Default card changed" };
  } catch (e) {
    return failure(e);
  }
}

export async function removeCardAction(orgId: string, paymentMethodId: string): Promise<ActionState> {
  try {
    const stripe = getStripe();
    const { gate: g } = await gate(orgId);
    const pm = await ownCard(orgId, paymentMethodId);
    if (!pm) return { status: "error", code: "not_found", message: "Card not found" };
    await stripe.paymentMethods.detach(pm);
    await rpc("mark_payment_method_detached", { p_payment_method_id: pm, p_actor: g.user_id });
    // Keep Stripe's default in line with HVEMS's.
    const { data: next } = await createSupabaseAdminClient()
      .from("payment_methods")
      .select("stripe_payment_method_id")
      .eq("organisation_id", orgId)
      .eq("is_default", true)
      .is("detached_at", null)
      .maybeSingle();
    if (g.stripe_customer_id) {
      await stripe.customers.update(g.stripe_customer_id, {
        invoice_settings: { default_payment_method: (next?.stripe_payment_method_id as string | undefined) ?? "" },
      });
    }
    revalidatePath("/", "layout");
    return { status: "success", message: "Card removed" };
  } catch (e) {
    return failure(e);
  }
}
