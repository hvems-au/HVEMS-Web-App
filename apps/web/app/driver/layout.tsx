import { Logo } from "@/components/brand/logo";

/** Operator portal: phone-first, no navigation; everything starts from an equipment code. */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-stroke bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <div className="w-28">
            <Logo variant="horizontal" priority />
          </div>
          <span className="ml-3 text-[13px] font-semibold text-ink-muted">Operator</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      <p className="pb-6 text-center text-[13px] font-semibold text-ink-subtle">If anyone is injured or in danger, call 000 first.</p>
    </div>
  );
}
