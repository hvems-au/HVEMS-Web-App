import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  GRANT_CAPABILITIES,
  GRANT_ELIGIBLE_ROLES,
  ROLE_CAPABILITIES,
  capabilitiesFor,
  grantIsValidForRole,
  roleIsValidForKind,
  type MemberGrant,
  type MemberRole,
} from "./matrix";

const MIGRATION = join(__dirname, "../../../supabase/migrations/20261109000200_identity.sql");

function seedPairs(sql: string, table: "role_capabilities" | "grant_capabilities"): Set<string> {
  const block = sql.split("-- BEGIN CAPABILITY SEED")[1]?.split("-- END CAPABILITY SEED")[0] ?? "";
  const section = block.split(`insert into app.${table}`)[1]?.split(";")[0] ?? "";
  return new Set([...section.matchAll(/\('([a-z_]+)', '([a-z_.]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`));
}

describe("capability matrix mirrors the database seed", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("role capabilities match exactly", () => {
    const ts = new Set(
      Object.entries(ROLE_CAPABILITIES).flatMap(([role, caps]) => [...new Set(caps)].map((c) => `${role}:${c}`)),
    );
    expect(seedPairs(sql, "role_capabilities")).toEqual(ts);
  });

  it("grant capabilities match exactly", () => {
    const ts = new Set(Object.entries(GRANT_CAPABILITIES).flatMap(([g, caps]) => caps.map((c) => `${g}:${c}`)));
    expect(seedPairs(sql, "grant_capabilities")).toEqual(ts);
  });

  it("grant eligibility matches app.grant_valid_for_role", () => {
    const fn = sql.split("create or replace function app.grant_valid_for_role")[1]?.split("$$;")[0] ?? "";
    for (const [grant, roles] of Object.entries(GRANT_ELIGIBLE_ROLES)) {
      const line = fn.split("\n").find((l) => l.includes(`when '${grant}'`)) ?? "";
      const dbRoles = [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((r) => r !== grant);
      expect(new Set(dbRoles), grant).toEqual(new Set(roles));
    }
  });

  it("every capability used is declared", () => {
    const declared = new Set<string>(CAPABILITIES);
    for (const caps of [...Object.values(ROLE_CAPABILITIES), ...Object.values(GRANT_CAPABILITIES)]) {
      for (const c of caps) expect(declared.has(c), c).toBe(true);
    }
  });
});

describe("SoW §2.4 role rules", () => {
  const has = (role: MemberRole, cap: string, grants: MemberGrant[] = []) => capabilitiesFor(role, grants).has(cap as never);

  it("Owner has full control and Clearance Authority by default", () => {
    expect(has("owner", "org.billing.manage")).toBe(true);
    expect(has("owner", "org.close")).toBe(true);
    expect(has("owner", "defects.clear_critical")).toBe(true);
  });

  it("Administrator has no billing or closure", () => {
    expect(has("administrator", "org.members.manage")).toBe(true);
    expect(has("administrator", "org.billing.manage")).toBe(false);
    expect(has("administrator", "org.close")).toBe(false);
  });

  it("only the Owner and Marketplace Buyers post jobs in a company", () => {
    expect(has("fleet_manager", "marketplace.post")).toBe(false);
    expect(has("fleet_manager", "marketplace.post", ["marketplace_buyer"])).toBe(true);
    expect(has("administrator", "marketplace.post")).toBe(false);
  });

  it("technicians never see costs or the marketplace", () => {
    expect(has("technician", "assets.costs.view")).toBe(false);
    expect(grantIsValidForRole("marketplace_buyer", "technician")).toBe(false);
  });

  it("drivers have no purchasing, clearance or marketplace authority", () => {
    for (const g of ["clearance_authority", "approval_limit", "marketplace_buyer"] as const) {
      expect(grantIsValidForRole(g, "driver_operator")).toBe(false);
    }
    expect(has("driver_operator", "assets.view")).toBe(false);
    expect(has("driver_operator", "assets.view_permitted")).toBe(true);
  });

  it("Finance approves parts only with the Approval Limit grant", () => {
    expect(has("finance", "parts.approve")).toBe(false);
    expect(has("finance", "parts.approve", ["approval_limit"])).toBe(true);
  });

  it("company and provider roles never mix", () => {
    expect(roleIsValidForKind("provider_manager", "company")).toBe(false);
    expect(roleIsValidForKind("technician", "provider")).toBe(false);
    expect(has("owner", "provider.jobs.browse")).toBe(false);
    expect(has("provider_owner", "assets.view")).toBe(false);
  });
});
