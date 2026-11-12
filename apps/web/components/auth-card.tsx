import { Logo } from "@/components/brand/logo";
import { ThemeSwitcher } from "@/components/theme/theme";

/**
 * Frame for every sign-in style page (sign-in, sign-up, recovery, email links,
 * invitations): a slim header with the logo and the appearance switch, the
 * page's card in the middle, and a one-line footer. Branding stays restrained
 * so the form comes first; on phones the card starts near the top so the
 * keyboard doesn't push it off-screen.
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
        <Logo variant="horizontal" priority className="w-[128px]" />
        <ThemeSwitcher compact />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-2 pb-10 sm:items-center sm:pt-0">{children}</main>
      <footer className="px-4 pb-6 text-center text-[12px] text-ink-subtle">© {new Date().getFullYear()} HVEMS · Heavy Vehicle &amp; Equipment Management System</footer>
    </div>
  );
}

/** The card itself: an optional portal label, a short heading, one line of help, then the form. */
export function AuthCard({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[440px] rounded-[16px] border border-stroke bg-surface px-5 py-7 shadow-card sm:px-9 sm:py-9">
      {eyebrow ? <p className="text-[12px] font-semibold tracking-[0.08em] text-brand-ink uppercase">{eyebrow}</p> : null}
      <h1 className="mt-1 text-[26px] leading-tight font-bold text-ink">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-[14.5px] leading-[1.55] text-ink-muted">{subtitle}</p> : null}
      <div className="mt-7">{children}</div>
    </div>
  );
}
