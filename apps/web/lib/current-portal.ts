import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { MyContext } from "@hvems/types";
import { PORTAL_FOR_ORG_KIND, PORTAL_INFO, portalForHost, portalOrigin, type PortalId } from "@/lib/portals";

/** The portal this request was made to. proxy.ts has already refused unknown hosts. */
export const getCurrentPortal = cache(async (): Promise<PortalId> => {
  const portal = portalForHost((await headers()).get("host"));
  if (!portal) notFound();
  return portal;
});

/** Origin of the current portal, for links in emails (verification, reset, invitations). */
export async function currentOrigin(): Promise<string> {
  return portalOrigin(await getCurrentPortal());
}

export function portalPathFor(ctx: Pick<MyContext, "kind" | "organisation_id">): string {
  return `/${ctx.kind === "provider" ? "provider" : "customer"}/${ctx.organisation_id}/dashboard`;
}

/**
 * Link to an organisation context: a plain path when it belongs to the current
 * portal, otherwise a handoff into the portal that serves it (spec §2.7).
 */
export function contextHref(ctx: Pick<MyContext, "kind" | "organisation_id">, current: PortalId): string {
  const target = PORTAL_FOR_ORG_KIND[ctx.kind];
  const path = portalPathFor(ctx);
  return target === current ? path : handoffHref(target, path);
}

export function handoffHref(target: PortalId, next: string): string {
  return `/auth/handoff/start?to=${target}&next=${encodeURIComponent(next)}`;
}

export function portalServesContext(portal: PortalId, ctx: Pick<MyContext, "kind">): boolean {
  return PORTAL_INFO[portal].orgKinds.includes(ctx.kind);
}
