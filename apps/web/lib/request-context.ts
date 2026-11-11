import "server-only";
import { headers } from "next/headers";
import { portalForHost } from "@/lib/portals";

/** Header values must be plain ASCII; anything else is dropped. */
const ascii = (v: string | null | undefined, max: number) => (v ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, max);

/**
 * Who is asking, for the audit record (AUD-01): the portal, the person's IP
 * address and browser. Sent to the database as request headers, where a
 * trigger copies them into each audit and security event's context.
 */
export async function auditContextHeaders(): Promise<Record<string, string>> {
  try {
    const h = await headers();
    const ip = ascii(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"), 64);
    return {
      "x-hvems-portal": ascii(portalForHost(h.get("host")) ?? "", 20),
      "x-hvems-client-ip": ip,
      "x-hvems-user-agent": ascii(h.get("user-agent"), 200),
    };
  } catch {
    // Outside a request (build time): no context.
    return {};
  }
}
