/**
 * Idle timeouts (SoW §2.5, CFG-45, ADM-01): a session with no activity for the
 * limit is signed out. Portals 12 hours, Super Admin console 30 minutes; the
 * values are platform settings (`security.idle_timeout_minutes_*`).
 *
 * The proxy keeps the time of the last request in an httpOnly cookie, tied to
 * the session id so a new sign-in starts fresh, and signs the session out when
 * the gap is too long. It also tells the page the limit (a readable cookie), so
 * the shell can sign out an open but unattended screen.
 */
export const ACTIVITY_COOKIE = "hvems_last_active";
export const IDLE_LIMIT_COOKIE = "hvems_idle_minutes";
export const IDLE_DEFAULT_MINUTES = { portal: 720, console: 30 } as const;

export function encodeActivity(sessionId: string, atSeconds: number): string {
  return `${sessionId}.${atSeconds}`;
}

export function parseActivity(value: string | undefined | null): { sessionId: string; at: number } | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const at = Number(value.slice(i + 1));
  return Number.isFinite(at) && at > 0 ? { sessionId: value.slice(0, i), at } : null;
}

/** True when the previous activity of this same session is older than the limit. */
export function isIdleExpired(previous: { sessionId: string; at: number } | null, sessionId: string, nowSeconds: number, limitMinutes: number): boolean {
  return !!previous && previous.sessionId === sessionId && nowSeconds - previous.at > limitMinutes * 60;
}
