import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalId } from "@/lib/portals";

/**
 * Portal handoff token (spec §2.7, D-06): bound to one person and one target
 * portal, valid for 60 seconds. It wraps a single-use Supabase sign-in token
 * hash, so it can be redeemed only once. Signed with HMAC-SHA256 under
 * PORTAL_HANDOFF_SECRET (or a key derived from the Supabase secret key).
 */
export const HANDOFF_TTL_SECONDS = 60;

export interface HandoffPayload {
  /** Supabase hashed token from generateLink (single use). */
  th: string;
  /** Target portal. */
  to: PortalId;
  /** User id the token was issued for. */
  sub: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function secret(): Buffer {
  const explicit = process.env.PORTAL_HANDOFF_SECRET;
  if (explicit) return Buffer.from(explicit, "utf8");
  const base = process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error("PORTAL_HANDOFF_SECRET or SUPABASE_SECRET_KEY must be configured");
  return createHmac("sha256", base).update("hvems-portal-handoff-v1").digest();
}

const b64 = (b: Buffer) => b.toString("base64url");

export function signHandoff(payload: Omit<HandoffPayload, "exp">, now = Date.now()): string {
  const body = b64(Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + HANDOFF_TTL_SECONDS }), "utf8"));
  const sig = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Returns the payload only if the signature is valid, it hasn't expired and it targets `portal`. */
export function verifyHandoff(token: string, portal: PortalId, now = Date.now()): HandoffPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffPayload;
  } catch {
    return null;
  }
  if (payload.to !== portal || typeof payload.th !== "string" || typeof payload.sub !== "string") return null;
  if (!(payload.exp > Math.floor(now / 1000))) return null;
  return payload;
}

/** Same-site relative paths only (prevents open redirects). */
export function safeRelative(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
