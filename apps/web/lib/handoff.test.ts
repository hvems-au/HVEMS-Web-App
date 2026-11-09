import { beforeAll, describe, expect, it } from "vitest";
import { safeRelative, signHandoff, verifyHandoff } from "./handoff";

beforeAll(() => {
  process.env.PORTAL_HANDOFF_SECRET = "test-secret-not-used-anywhere";
});

const base = { th: "hash123", to: "provider" as const, sub: "user-1" };

describe("portal handoff token", () => {
  it("round-trips for the target portal within 60 seconds", () => {
    const t = signHandoff(base, 1_000_000);
    expect(verifyHandoff(t, "provider", 1_000_000 + 59_000)).toMatchObject(base);
  });

  it("expires after 60 seconds", () => {
    const t = signHandoff(base, 1_000_000);
    expect(verifyHandoff(t, "provider", 1_000_000 + 60_000)).toBeNull();
  });

  it("is bound to the target portal", () => {
    expect(verifyHandoff(signHandoff(base), "company")).toBeNull();
  });

  it("rejects a tampered payload or signature", () => {
    const t = signHandoff(base);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, sub: "attacker", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyHandoff(`${forged}.${sig}`, "provider")).toBeNull();
    expect(verifyHandoff(`${body}.AAAA`, "provider")).toBeNull();
    expect(verifyHandoff("garbage", "provider")).toBeNull();
  });

  it("only allows same-site relative redirects", () => {
    expect(safeRelative("/provider/x/dashboard", "/")).toBe("/provider/x/dashboard");
    expect(safeRelative("//evil.example", "/")).toBe("/");
    expect(safeRelative("https://evil.example", "/")).toBe("/");
    expect(safeRelative(null, "/select-context")).toBe("/select-context");
  });
});
