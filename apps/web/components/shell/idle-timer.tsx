"use client";
import * as React from "react";
import { toast } from "sonner";
import { IDLE_DEFAULT_MINUTES, IDLE_LIMIT_COOKIE } from "@/lib/idle";

const SHARED_KEY = "hvems:last-activity";
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;

function limitMinutes(): number {
  const m = document.cookie.match(new RegExp(`(?:^|; )${IDLE_LIMIT_COOKIE}=(\\d+)`));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : IDLE_DEFAULT_MINUTES.portal;
}

/**
 * Signs an unattended screen out after the portal's idle limit (12 h portals,
 * 30 min console), with a one-minute warning. Activity in any tab of the same
 * portal counts. The server enforces the same limit on the next request.
 */
export function IdleTimer() {
  React.useEffect(() => {
    let last = Date.now();
    let lastShared = 0;
    let warned: string | number | null = null;
    let done = false;

    const mark = () => {
      last = Date.now();
      if (warned !== null) {
        toast.dismiss(warned);
        warned = null;
      }
      // Share with other tabs, at most every 10 seconds.
      if (last - lastShared > 10_000) {
        lastShared = last;
        try {
          localStorage.setItem(SHARED_KEY, String(last));
        } catch {
          /* storage unavailable: this tab still counts its own activity */
        }
      }
    };
    mark();
    for (const e of EVENTS) window.addEventListener(e, mark, { passive: true });

    const tick = window.setInterval(() => {
      if (done) return;
      let latest = last;
      try {
        latest = Math.max(last, Number(localStorage.getItem(SHARED_KEY)) || 0);
      } catch {
        /* ignore */
      }
      const limitMs = limitMinutes() * 60_000;
      const idle = Date.now() - latest;
      if (idle >= limitMs) {
        done = true;
        void fetch("/auth/sign-out", { method: "POST" })
          .catch(() => undefined)
          // A full page load on purpose: nothing from the signed-out session stays on screen or in memory.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          .finally(() => window.location.assign("/login?reason=idle"));
      } else if (limitMs - idle <= 60_000 && warned === null) {
        warned = toast.warning("You'll be signed out in a minute because there's been no activity. Move the mouse or press a key to stay signed in.", {
          duration: 60_000,
        });
      }
    }, 10_000);

    return () => {
      window.clearInterval(tick);
      for (const e of EVENTS) window.removeEventListener(e, mark);
    };
  }, []);
  return null;
}
