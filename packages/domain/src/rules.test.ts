import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { billingMonthBounds, billingMonthOf, formatDateAU, previousBillingMonth } from "./calendar";
import { ASSET_CLASSES, assessMeterReading } from "./fleet";
import { isMfaRequired, isTriviallyGuessablePin, isValidAbn, isWellFormedDriverPin, pinLockedUntil } from "./identity";
import { canReturnToService, checkDeferral, checkSeverityChange, deriveCondition, type OpenCause } from "./safety";

describe("asset condition (SoW §3.4) — mirrors app.derive_condition", () => {
  const c = (...kinds: OpenCause["kind"][]) => kinds.map((kind) => ({ kind }));
  it("no causes ⇒ Active", () => expect(deriveCondition([])).toBe("active"));
  it("Minor defect ⇒ Needs attention", () => expect(deriveCondition(c("minor_defect"))).toBe("needs_attention"));
  it("Critical defect ⇒ Broken/Out of service immediately", () =>
    expect(deriveCondition(c("minor_defect", "critical_defect"))).toBe("out_of_service"));
  it("unverified unsafe report ⇒ Broken/Out of service", () =>
    expect(deriveCondition(c("unverified_unsafe_report"))).toBe("out_of_service"));
  it("cleared Critical awaiting RTS ⇒ still Broken/Out of service", () =>
    expect(deriveCondition(c("awaiting_return_to_service"))).toBe("out_of_service"));
  it("overdue service only counts when the company rule is on", () => {
    expect(deriveCondition(c("overdue_service"))).toBe("active");
    expect(deriveCondition(c("overdue_service"), { overdueServiceSetsNeedsAttention: true })).toBe("needs_attention");
  });
  it("return to service is blocked by any other Out of service cause", () => {
    expect(canReturnToService(c("awaiting_return_to_service", "minor_defect"))).toBe(true);
    expect(canReturnToService(c("awaiting_return_to_service", "out_of_service_hold"))).toBe(false);
    expect(canReturnToService(c("critical_defect"))).toBe(false);
  });
});

describe("severity and deferral (SoW §3.4)", () => {
  it("anyone can raise a severity", () =>
    expect(checkSeverityChange("minor", "critical", { hasClearanceAuthority: false }, {})).toEqual({ allowed: true }));
  it("lowering needs Clearance Authority and a reason", () => {
    expect(checkSeverityChange("minor", "advisory", { hasClearanceAuthority: false }, { reason: "ok" })).toMatchObject({ allowed: false });
    expect(checkSeverityChange("minor", "advisory", { hasClearanceAuthority: true }, {})).toMatchObject({ reason: "reason_required" });
  });
  it("lowering a Critical also needs evidence", () => {
    expect(checkSeverityChange("critical", "minor", { hasClearanceAuthority: true }, { reason: "Checked" })).toMatchObject({
      reason: "evidence_required",
    });
    expect(checkSeverityChange("critical", "minor", { hasClearanceAuthority: true }, { reason: "Checked", evidenceCount: 1 })).toEqual({
      allowed: true,
    });
  });
  it("Critical defects can't be deferred; Minor up to 30 days past the original due date", () => {
    const originalDue = new Date("2026-11-10T00:00:00Z");
    expect(checkDeferral("critical", { hasClearanceAuthority: true }, { reason: "x", originalDue, newDue: originalDue })).toMatchObject({
      reason: "critical_cannot_be_deferred",
    });
    expect(
      checkDeferral("minor", { hasClearanceAuthority: true }, { reason: "Parts on order", originalDue, newDue: new Date("2026-12-10T00:00:00Z") }),
    ).toEqual({ allowed: true });
    expect(
      checkDeferral("minor", { hasClearanceAuthority: true }, { reason: "Parts on order", originalDue, newDue: new Date("2026-12-10T00:00:01Z") }),
    ).toMatchObject({ reason: "beyond_deferral_limit" });
  });
});

describe("Queensland business calendar", () => {
  it("23:30 UTC on 31 Oct is 1 November in Brisbane", () =>
    expect(billingMonthOf(new Date("2026-10-31T23:30:00Z"))).toEqual({ year: 2026, month: 11 }));
  it("November bounds start 00:00 AEST on 1 Nov", () => {
    const { start, end } = billingMonthBounds({ year: 2026, month: 11 });
    expect(start.toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-30T14:00:00.000Z");
  });
  it("January rolls back to December", () => expect(previousBillingMonth({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 }));
  it("dates format as dd/mm/yyyy", () => expect(formatDateAU(new Date("2026-11-08T20:00:00Z"))).toBe("09/11/2026"));
});

describe("identity rules", () => {
  it("validates ABN checksums", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("12 345 678 901")).toBe(false);
    expect(isValidAbn("5182475355")).toBe(false);
  });
  it("driver PINs are six digits; five wrong attempts lock for 15 minutes", () => {
    expect(isWellFormedDriverPin("048213")).toBe(true);
    expect(isWellFormedDriverPin("48213")).toBe(false);
    expect(pinLockedUntil(4, new Date("2026-11-09T00:00:00Z"))).toBeNull();
    expect(pinLockedUntil(5, new Date("2026-11-09T00:00:00Z"))?.toISOString()).toBe("2026-11-09T00:15:00.000Z");
  });
  it("flags trivially guessable PINs (recommended check)", () => {
    expect(isTriviallyGuessablePin("111111")).toBe(true);
    expect(isTriviallyGuessablePin("123456")).toBe(true);
    expect(isTriviallyGuessablePin("654321")).toBe(true);
    expect(isTriviallyGuessablePin("048213")).toBe(false);
  });
  it("MFA rules follow SoW §2.5", () => {
    expect(isMfaRequired("owner", { memberCount: 1, hasPaymentMethod: false })).toBe(false);
    expect(isMfaRequired("owner", { memberCount: 2, hasPaymentMethod: false })).toBe(true);
    expect(isMfaRequired("finance", { memberCount: 1, hasPaymentMethod: true })).toBe(true);
    expect(isMfaRequired("provider_owner", { memberCount: 5, hasPaymentMethod: false })).toBe(false);
    expect(isMfaRequired("staff", { memberCount: 1, hasPaymentMethod: false })).toBe(true);
    expect(isMfaRequired("other", { memberCount: 9, hasPaymentMethod: true })).toBe(false);
  });
});

describe("meter readings (SoW §3.1)", () => {
  const prev = { value: 1000, readAt: new Date("2026-11-01T00:00:00Z") };
  it("lower readings need a reason and acceptance", () =>
    expect(assessMeterReading(prev, { value: 900, readAt: new Date("2026-11-02T00:00:00Z") }, 2000).kind).toBe(
      "lower_needs_reason_and_acceptance",
    ));
  it("implausible jumps need confirmation", () =>
    expect(assessMeterReading(prev, { value: 9000, readAt: new Date("2026-11-02T00:00:00Z") }, 2000).kind).toBe(
      "implausible_jump_needs_confirmation",
    ));
  it("normal use is fine", () =>
    expect(assessMeterReading(prev, { value: 1500, readAt: new Date("2026-11-02T00:00:00Z") }, 2000).kind).toBe("ok"));
});

describe("asset classes mirror the database seed", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261109000300_fleet.sql"), "utf8");
  it.each(ASSET_CLASSES.map((c) => [c.code, c] as const))("%s", (code, cls) => {
    const line = sql.split("\n").find((l) => l.includes(`('${code}',`));
    expect(line, code).toBeDefined();
    expect(line).toContain(`'${cls.category}'`);
    expect(line).toContain(`'${cls.defaultMeterType}'`);
    expect(line).toContain(`'{${cls.requiredFields.join(",")}}'`);
  });
});
