import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Connection fees on acceptance (ADR-006). The database decides what may happen and keeps
 * the state; this module only talks to Stripe:
 *   hold (authorise, nothing charged) the poster's fee unless a waiver covers it, then the
 *   provider's; capture both only when both are held; release or refund anything left over.
 * Every Stripe call has an idempotency key from the attempt, so a retry never charges twice.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Side = "poster" | "provider";

interface Attempt {
  id: string;
  state: string;
  job_title: string;
  job_number: number;
  urgency: "standard" | "urgent";
  organisation_id: string;
  provider_id: string;
  poster_fee_cents: number;
  provider_fee_cents: number;
  poster_status: string;
  provider_status: string;
  poster_payment_intent: string | null;
  provider_payment_intent: string | null;
  provider_tries: number;
  poster_customer: string | null;
  poster_payment_method: string | null;
  provider_customer: string | null;
  provider_payment_method: string | null;
}

export type FeeOutcome =
  | { outcome: "confirmed"; engagementId: string }
  | { outcome: "pending_provider" }
  | { outcome: "failed"; message: string };

// The admin client isn't typed for these functions yet (types regenerate after the migration is applied).
async function rpc<T>(db: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function load(db: Admin, id: string): Promise<Attempt> {
  const rows = await rpc<Attempt[]>(db, "fee_attempt_for_charging", { p_id: id });
  const row = rows?.[0];
  if (!row) throw new Error("Connection fee attempt not found");
  return row;
}

function stripeMessage(e: unknown): { message: string; paymentIntent: string | null } {
  const err = e as { message?: string; code?: string; payment_intent?: { id?: string } };
  const message =
    err.code === "authentication_required"
      ? "The bank asked for extra confirmation, which can't be done automatically. Use a different card."
      : (err.message ?? "The card was declined");
  return { message, paymentIntent: err.payment_intent?.id ?? null };
}

/** Place a hold on one side's default card. */
async function authorise(stripe: Stripe, a: Attempt, side: Side): Promise<{ ok: boolean; paymentIntent: string | null; error?: string }> {
  const customer = side === "poster" ? a.poster_customer : a.provider_customer;
  const pm = side === "poster" ? a.poster_payment_method : a.provider_payment_method;
  const amount = side === "poster" ? a.poster_fee_cents : a.provider_fee_cents;
  if (!customer || !pm) return { ok: false, paymentIntent: null, error: "No card on file. Add a card under Billing." };
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: "aud",
        customer,
        payment_method: pm,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        description: `HVEMS connection fee, job ${a.job_number} (${a.urgency})`,
        statement_descriptor_suffix: "CONNECTION FEE",
        metadata: { hvems_fee_attempt_id: a.id, side, organisation_id: side === "poster" ? a.organisation_id : a.provider_id },
      },
      { idempotencyKey: `hvems-fee-${a.id}-${side}${side === "provider" ? `-${a.provider_tries}` : ""}` },
    );
    if (pi.status === "requires_capture") return { ok: true, paymentIntent: pi.id };
    if (pi.status === "succeeded") return { ok: true, paymentIntent: pi.id };
    return { ok: false, paymentIntent: pi.id, error: "The card couldn't be authorised" };
  } catch (e) {
    const m = stripeMessage(e);
    return { ok: false, paymentIntent: m.paymentIntent, error: m.message };
  }
}

async function record(db: Admin, a: Attempt, side: Side, r: { ok: boolean; paymentIntent: string | null; error?: string }): Promise<string> {
  return rpc<string>(db, "record_fee_authorisation", {
    p_id: a.id,
    p_side: side,
    p_payment_intent: r.paymentIntent,
    p_ok: r.ok,
    p_error: r.error ?? null,
  });
}

/** Both held: re-check, capture both, confirm the engagement. */
async function captureAndConfirm(db: Admin, stripe: Stripe, id: string): Promise<FeeOutcome> {
  const go = await rpc<boolean>(db, "begin_fee_capture", { p_id: id });
  if (!go) return { outcome: "failed", message: "The job or proposal is no longer available. Nothing was charged." };
  const a = await load(db, id);
  try {
    for (const pi of [a.poster_status === "authorised" ? a.poster_payment_intent : null, a.provider_payment_intent]) {
      if (!pi) continue;
      const current = await stripe.paymentIntents.retrieve(pi);
      if (current.status === "requires_capture") await stripe.paymentIntents.capture(pi, {}, { idempotencyKey: `hvems-fee-capture-${pi}` });
      else if (current.status !== "succeeded") throw new Error(`Payment ${current.status.replace(/_/g, " ")}`);
    }
  } catch (e) {
    // Rare: a hold that succeeded couldn't be captured. Refund or release both (cleanup) so nobody is charged.
    await rpc(db, "fail_fee_acceptance", { p_id: id, p_error: stripeMessage(e).message });
    return { outcome: "failed", message: "A connection fee couldn't be completed, so nothing was charged. Try again shortly." };
  }
  try {
    const engagementId = await rpc<string>(db, "complete_fee_acceptance", { p_id: id });
    return { outcome: "confirmed", engagementId };
  } catch (e) {
    await rpc(db, "fail_fee_acceptance", { p_id: id, p_error: (e as Error).message });
    return { outcome: "failed", message: "The engagement couldn't be confirmed, so both fees are being refunded." };
  }
}

/** After begin_fee_acceptance: hold the poster's fee (unless waived), then the provider's. */
export async function runFeeAcceptance(attemptId: string): Promise<FeeOutcome> {
  const db = createSupabaseAdminClient();
  let stripe: Stripe;
  let a = await load(db, attemptId);
  try {
    stripe = getStripe();
  } catch (e) {
    await record(db, a, "poster", { ok: false, paymentIntent: null, error: (e as Error).message });
    return { outcome: "failed", message: "Card payments aren't available right now, so the proposal wasn't accepted. Try again later." };
  }

  if (a.poster_status === "none") {
    const r = await authorise(stripe, a, "poster");
    const state = await record(db, a, "poster", r);
    if (state === "failed_poster")
      return { outcome: "failed", message: `Your connection fee didn't go through: ${r.error ?? "the card was declined"}. Update your card under Billing. Nothing was charged.` };
  }
  a = await load(db, attemptId);
  if (!["authorising", "pending_provider"].includes(a.state)) return { outcome: "failed", message: "This acceptance is no longer in progress." };

  const r = await authorise(stripe, a, "provider");
  const state = await record(db, a, "provider", r);
  if (!r.ok) return state === "pending_provider" ? { outcome: "pending_provider" } : { outcome: "failed", message: "This acceptance is no longer in progress." };
  return captureAndConfirm(db, stripe, attemptId);
}

/** The provider updated its card: try its fee again (retry_provider_fee already checked who and when). */
export async function runProviderRetry(attemptId: string): Promise<FeeOutcome> {
  const db = createSupabaseAdminClient();
  const stripe = getStripe();
  const a = await load(db, attemptId);
  const r = await authorise(stripe, a, "provider");
  await record(db, a, "provider", r);
  if (!r.ok) return { outcome: "failed", message: `Your card was declined: ${r.error ?? "try another card"}` };
  return captureAndConfirm(db, stripe, attemptId);
}

/** Release holds and refund captured fees on finished attempts (billing dispatch). */
export async function cleanUpFeeAttempts(db: Admin, stripe: Stripe): Promise<{ cleaned: number; failed: number }> {
  const rows = await rpc<{ id: string; poster_payment_intent: string | null; provider_payment_intent: string | null }[]>(db, "claim_fee_cleanups", { p_limit: 20 });
  let cleaned = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const out: Record<Side, string | null> = { poster: null, provider: null };
    try {
      for (const side of ["poster", "provider"] as Side[]) {
        const id = side === "poster" ? row.poster_payment_intent : row.provider_payment_intent;
        if (!id) continue;
        const pi = await stripe.paymentIntents.retrieve(id);
        if (pi.status === "requires_capture") {
          await stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `hvems-fee-release-${id}` });
          out[side] = "released";
        } else if (pi.status === "succeeded") {
          await stripe.refunds.create({ payment_intent: id, reason: "requested_by_customer", metadata: { hvems_fee_attempt_id: row.id } }, { idempotencyKey: `hvems-fee-refund-${id}` });
          out[side] = "refunded";
        } else if (pi.status === "canceled") {
          out[side] = "released";
        }
      }
      await rpc(db, "finish_fee_cleanup", { p_id: row.id, p_poster_status: out.poster, p_provider_status: out.provider, p_error: null });
      cleaned++;
    } catch (e) {
      await rpc(db, "finish_fee_cleanup", { p_id: row.id, p_poster_status: out.poster, p_provider_status: out.provider, p_error: (e as Error).message });
      failed++;
    }
  }
  return { cleaned, failed };
}
