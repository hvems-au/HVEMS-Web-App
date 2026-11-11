import { describe, expect, it } from "vitest";
import { startOfDayInZone } from "./calendar";
import { credentialStatus } from "./drivers";

describe("credentialStatus", () => {
  const today = "2026-11-11";
  it("reports expired, expiring, current and no expiry", () => {
    expect(credentialStatus("2026-11-10", today)).toBe("expired");
    expect(credentialStatus("2026-11-11", today)).toBe("expiring");
    expect(credentialStatus("2026-12-11", today)).toBe("expiring");
    expect(credentialStatus("2026-12-12", today)).toBe("current");
    expect(credentialStatus(null, today)).toBe("no_expiry");
  });
  it("uses the warning period setting", () => {
    expect(credentialStatus("2026-11-20", today, 7)).toBe("current");
    expect(credentialStatus("2026-11-18", today, 7)).toBe("expiring");
  });
});

describe("startOfDayInZone", () => {
  it("finds midnight in Brisbane and Sydney (daylight saving)", () => {
    expect(startOfDayInZone("2026-11-11", "Australia/Brisbane").toISOString()).toBe("2026-11-10T14:00:00.000Z");
    expect(startOfDayInZone("2026-11-11", "Australia/Sydney").toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(startOfDayInZone("2026-06-11", "Australia/Sydney").toISOString()).toBe("2026-06-10T14:00:00.000Z");
  });
});
