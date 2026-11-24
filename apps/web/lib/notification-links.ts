/**
 * Where a notification opens, shared by the in-app tray and notification emails.
 * Pure (no server or client imports).
 */
export interface NotificationTarget {
  kind: string;
  link_path?: string | null;
  asset_id?: string | null;
  inspection_id?: string | null;
}

/** The portal base path for an organisation of each kind, e.g. /customer/<id> or /provider/<id>. */
export function portalBasePath(orgKind: string, orgId: string): string {
  return orgKind === "provider" ? `/provider/${orgId}` : `/customer/${orgId}`;
}

/** The page a notification opens, as a path on its portal; `fallback` when nothing more specific applies. */
export function notificationPath(n: NotificationTarget, base: string, fallback: string): string {
  if (n.link_path) return `${base}/${n.link_path}`;
  if (n.kind === "parts_approval") return `${base}/parts?view=approval`;
  if (n.kind === "parts_decision") return `${base}/parts`;
  if (n.kind === "meter_reading_review") return `${base}/equipment/readings`;
  if (n.inspection_id) return `${base}/inspections/${n.inspection_id}`;
  if (n.asset_id) return `${base}/equipment/${n.asset_id}`;
  return fallback;
}
