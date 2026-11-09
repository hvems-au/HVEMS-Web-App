import { describe, expect, it } from "vitest";
import { readPublicEnv } from "./index";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://anvqykllajezwaasguqp.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_123456",
};

describe("public environment", () => {
  it("hides the support link when no support URL is configured", () => {
    expect(readPublicEnv(base).NEXT_PUBLIC_SUPPORT_URL).toBeUndefined();
    expect(readPublicEnv({ ...base, NEXT_PUBLIC_SUPPORT_URL: "" }).NEXT_PUBLIC_SUPPORT_URL).toBeUndefined();
  });

  it("accepts a helpdesk URL or a mailto address", () => {
    expect(readPublicEnv({ ...base, NEXT_PUBLIC_SUPPORT_URL: "https://help.example.com/contact" }).NEXT_PUBLIC_SUPPORT_URL).toBe(
      "https://help.example.com/contact",
    );
    expect(readPublicEnv({ ...base, NEXT_PUBLIC_SUPPORT_URL: "mailto:help@example.com" }).NEXT_PUBLIC_SUPPORT_URL).toBe(
      "mailto:help@example.com",
    );
  });

  it("refuses a malformed support URL", () => {
    expect(() => readPublicEnv({ ...base, NEXT_PUBLIC_SUPPORT_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SUPPORT_URL/);
  });
});
