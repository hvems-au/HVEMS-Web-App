import { describe, expect, it } from "vitest";
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
