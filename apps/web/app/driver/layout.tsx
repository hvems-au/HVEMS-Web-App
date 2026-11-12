import { Logo } from "@/components/brand/logo";
import { ThemeSwitcher } from "@/components/theme/theme";

/** Operator portal (Driver / Operator): phone-first, works on desktop too. */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-stroke bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <a href="/driver" className="w-28" aria-label="Operator home">
            <Logo variant="horizontal" priority />
          </a>
          <span className="text-[13px] font-semibold text-ink-muted">Driver / Operator</span>
          <ThemeSwitcher compact className="ml-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
      <p className="pb-6 text-center text-[13px] font-semibold text-ink-subtle">If anyone is injured or in danger, call 000 first.</p>
    </div>
  );
}
