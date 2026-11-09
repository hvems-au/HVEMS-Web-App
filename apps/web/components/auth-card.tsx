import { Logo } from "@/components/brand/logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[513px] rounded-[18px] border border-stroke bg-white px-6 py-9 shadow-sm sm:px-11">
      <div className="mx-auto w-[220px]">
        <Logo variant="horizontal" priority />
      </div>
      <h1 className="mt-6 text-center text-h1 text-ink">{title}</h1>
      {subtitle ? <p className="mx-auto mt-2 max-w-sm text-center text-[15px] leading-[24px] text-ink-subtle">{subtitle}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}
