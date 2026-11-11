import { describe, expect, it } from "vitest";
import { encodeActivity, isIdleExpired, parseActivity } from "./idle";

describe("idle timeout", () => {
  const now = 1_800_000_000;
  it("round-trips the activity cookie", () => {
    expect(parseActivity(encodeActivity("abc-123", now))).toEqual({ sessionId: "abc-123", at: now });
    expect(parseActivity("garbage")).toBeNull();
    expect(parseActivity(undefined)).toBeNull();
  });
  it("expires the same session after the limit", () => {
    expect(isIdleExpired({ sessionId: "s1", at: now - 31 * 60 }, "s1", now, 30)).toBe(true);
    expect(isIdleExpired({ sessionId: "s1", at: now - 29 * 60 }, "s1", now, 30)).toBe(false);
  });
  it("never expires a new sign-in because of an older session's cookie", () => {
    expect(isIdleExpired({ sessionId: "old", at: now - 3 * 86400 }, "new", now, 720)).toBe(false);
    expect(isIdleExpired(null, "new", now, 720)).toBe(false);
  });
});
