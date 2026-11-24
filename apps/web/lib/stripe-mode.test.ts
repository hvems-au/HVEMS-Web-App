import { describe, expect, it } from "vitest";
import { liveKeysAllowed, stripeAvailability, stripeKeyMode } from "./stripe-mode";

const prod = { vercelEnv: "production", companyHost: "portal.hvems.com.au" };

describe("Stripe key rules", () => {
  it("recognises sandbox and live keys", () => {
    expect(stripeKeyMode("sk_test_abc123")).toBe("test");
    expect(stripeKeyMode("rk_live_abc123")).toBe("live");
    expect(stripeKeyMode("pk_live_abc123")).toBe("live");
    expect(stripeKeyMode("whsec_abc")).toBe("invalid");
    expect(stripeKeyMode("")).toBeNull();
  });

  it("allows live keys only on the production site", () => {
    expect(liveKeysAllowed(prod)).toBe(true);
    expect(liveKeysAllowed({ vercelEnv: "production", companyHost: "dev-portal.hvems.com.au" })).toBe(false);
    expect(liveKeysAllowed({ vercelEnv: "preview", companyHost: "portal.hvems.com.au" })).toBe(false);
    expect(liveKeysAllowed({ companyHost: "company.localhost:3000" })).toBe(false);
  });

  it("switches billing off instead of using a live key elsewhere", () => {
    const dev = { vercelEnv: "production", companyHost: "dev-portal.hvems.com.au" };
    expect(stripeAvailability("sk_live_abc", dev)).toEqual({ ok: false, reason: expect.stringContaining("production site") });
    expect(stripeAvailability("sk_test_abc", dev)).toEqual({ ok: true, mode: "test" });
    expect(stripeAvailability("sk_live_abc", prod)).toEqual({ ok: true, mode: "live" });
    expect(stripeAvailability(undefined, prod).ok).toBe(false);
  });
});
