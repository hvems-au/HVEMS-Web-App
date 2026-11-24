import "server-only";
import Stripe from "stripe";
import { portalHost } from "@/lib/portals";
import { stripeAvailability, type StripeAvailability } from "@/lib/stripe-mode";

const env = () => ({ vercelEnv: process.env.VERCEL_ENV, companyHost: portalHost("company") });

/** Server key availability (see lib/stripe-mode.ts for the live-key rule). */
export function stripeServerAvailability(): StripeAvailability {
  return stripeAvailability(process.env.STRIPE_SECRET_KEY, env());
}

/** The publishable key for the card form, or null when billing is off here. Must match the server key's mode. */
export function stripePublishableKey(): string | null {
  const server = stripeServerAvailability();
  const pub = stripeAvailability(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, env());
  return server.ok && pub.ok && server.mode === pub.mode ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY! : null;
}

let client: Stripe | null = null;

/** The Stripe client, or an error explaining why billing is off in this environment. */
export function getStripe(): Stripe {
  const a = stripeServerAvailability();
  if (!a.ok) throw new BillingUnavailableError(a.reason);
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "HVEMS" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return client;
}

export class BillingUnavailableError extends Error {
  readonly code = "billing_unavailable";
}
