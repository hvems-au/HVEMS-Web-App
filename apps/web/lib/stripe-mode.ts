/**
 * Which Stripe keys may be used where. Pure, so it is unit-tested.
 *
 * Live keys (sk_live_ / rk_live_ / pk_live_) are used only on the real production site:
 * Vercel production AND the company portal on HVEMS's production address. Anywhere
 * else (the development site, previews, a local machine) a live key switches billing
 * off instead of charging real cards. Sandbox keys work everywhere.
 */
export type StripeKeyMode = "test" | "live" | "invalid";

export const PRODUCTION_COMPANY_HOST = "portal.hvems.com.au";

export function stripeKeyMode(key: string | undefined | null): StripeKeyMode | null {
  if (!key) return null;
  if (/^(sk|rk|pk)_test_[A-Za-z0-9]+$/.test(key)) return "test";
  if (/^(sk|rk|pk)_live_[A-Za-z0-9]+$/.test(key)) return "live";
  return "invalid";
}

export function liveKeysAllowed(env: { vercelEnv?: string; companyHost?: string }): boolean {
  return env.vercelEnv === "production" && (env.companyHost ?? "").toLowerCase() === PRODUCTION_COMPANY_HOST;
}

export type StripeAvailability = { ok: true; mode: "test" | "live" } | { ok: false; reason: string };

/** Whether a key can be used in this environment, and why not. */
export function stripeAvailability(key: string | undefined | null, env: { vercelEnv?: string; companyHost?: string }): StripeAvailability {
  const mode = stripeKeyMode(key);
  if (!mode) return { ok: false, reason: "Billing isn't set up yet." };
  if (mode === "invalid") return { ok: false, reason: "The Stripe key isn't recognised." };
  if (mode === "live" && !liveKeysAllowed(env)) {
    return { ok: false, reason: "Live Stripe keys only work on the production site. Use sandbox keys here." };
  }
  return { ok: true, mode };
}
