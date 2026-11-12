import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, MailCheck, UserPlus } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { getCurrentPortal } from "@/lib/current-portal";
import { PORTALS, portalOrigin } from "@/lib/portals";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Continue" };

/** Email link types and what the page says for each (Supabase Auth email templates link here). */
const KINDS = {
  email: { title: "Confirm your email", body: "Continue to confirm your email address and finish setting up your account.", button: "Confirm email", icon: MailCheck },
  recovery: { title: "Reset your password", body: "Continue to choose a new password.", button: "Choose a new password", icon: KeyRound },
  invite: { title: "Accept your invitation", body: "Continue to accept the invitation and set your password.", button: "Accept invitation", icon: UserPlus },
  email_change: { title: "Confirm your new email", body: "Continue to confirm your new sign-in email.", button: "Confirm new email", icon: MailCheck },
} as const;
type Kind = keyof typeof KINDS;

/**
 * Landing page for links in HVEMS emails, so they show an HVEMS address
 * instead of Supabase's. Nothing is used up here: the one-time token is only
 * checked when the person presses Continue (link scanners such as Microsoft
 * Safe Links open this page, not the token). The token is checked on the
 * portal the request came from, so the session lands on the right portal.
 */
export default async function ContinuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tokenHash = firstParam(sp.token_hash) ?? "";
  const rawType = firstParam(sp.type) ?? "";
  const type: Kind | null = rawType in KINDS ? (rawType as Kind) : rawType === "signup" || rawType === "magiclink" ? "email" : null;

  // Back to the portal the request came from (only HVEMS portals; anything else stays here).
  const here = portalOrigin(await getCurrentPortal());
  let origin = here;
  let next: string | null = null;
  try {
    const redirect = new URL(firstParam(sp.redirect_to) ?? "");
    const known = PORTALS.filter((p) => p !== "driver").map((p) => portalOrigin(p));
    if (known.includes(redirect.origin)) origin = redirect.origin;
    next = redirect.searchParams.get("next");
  } catch {
    // No or bad redirect: stay on this portal.
  }

  if (!type || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    return (
      <AuthCard title="This link doesn't work">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-[15px] text-ink-muted">The link is incomplete or has been changed. Request a new email and use the newest one.</p>
          <Link href="/login" className="text-[14px] font-semibold text-link hover:underline">
            Back to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  const target = new URL("/auth/callback", origin);
  target.searchParams.set("token_hash", tokenHash);
  target.searchParams.set("type", type);
  if (next && next.startsWith("/") && !next.startsWith("//")) target.searchParams.set("next", next);
  const k = KINDS[type];

  return (
    <AuthCard title={k.title}>
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#fdeee3] text-brand">
          <k.icon className="size-8" aria-hidden />
        </span>
        <p className="text-[15px] text-ink-muted">{k.body}</p>
        <Button asChild size="lg" className="w-full">
          <a href={target.toString()} rel="nofollow">
            {k.button}
          </a>
        </Button>
        <p className="text-[12.5px] text-ink-subtle">The link works once and expires 1 hour after the email was sent.</p>
      </div>
    </AuthCard>
  );
}
