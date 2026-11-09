import { afterEach, describe, expect, it } from "vitest";
import { PORTAL_FOR_ORG_KIND, portalForHost, portalHost, portalOrigin, startsWithAny } from "./portals";

describe("portal hosts", () => {
  afterEach(() => {
    delete process.env.COMPANY_HOST;
  });

  it("maps the default local hosts to their portals", () => {
    expect(portalForHost("admin.localhost:3000")).toBe("admin");
    expect(portalForHost("Company.localhost:3000")).toBe("company");
    expect(portalForHost("market.localhost:3000")).toBe("market");
    expect(portalForHost("provider.localhost:3000")).toBe("provider");
    expect(portalForHost("driver.localhost:3000")).toBe("driver");
  });

  it("treats unknown hosts as no portal", () => {
    expect(portalForHost("localhost:3000")).toBeNull();
    expect(portalForHost("evil.example")).toBeNull();
    expect(portalForHost(null)).toBeNull();
  });

  it("uses configured hosts and https outside localhost", () => {
    process.env.COMPANY_HOST = "company.hvems.com.au";
    expect(portalHost("company")).toBe("company.hvems.com.au");
    expect(portalForHost("company.hvems.com.au")).toBe("company");
    expect(portalForHost("company.localhost:3000")).toBeNull();
    expect(portalOrigin("company")).toBe("https://company.hvems.com.au");
    expect(portalOrigin("provider")).toBe("http://provider.localhost:3000");
  });

  it("keeps companies (with their marketplace) separate from marketplace-only customers", () => {
    expect(PORTAL_FOR_ORG_KIND.company).toBe("company");
    expect(PORTAL_FOR_ORG_KIND.marketplace_customer).toBe("market");
    expect(PORTAL_FOR_ORG_KIND.provider).toBe("provider");
  });

  it("matches whole path segments only", () => {
    expect(startsWithAny("/customer/x", ["/customer"])).toBe(true);
    expect(startsWithAny("/customers", ["/customer"])).toBe(false);
    expect(startsWithAny("/admin", ["/admin"])).toBe(true);
  });
});
