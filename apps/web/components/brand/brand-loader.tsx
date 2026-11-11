import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Loading screen: the HVEMS logo with a gentle pulse and an orange progress
 * bar. `fullScreen` for pages outside the portal shell (sign-in, onboarding);
 * otherwise it fills the shell's content area so the sidebar stays put.
 */
export function BrandLoader({ fullScreen = false, label = "Loading" }: { fullScreen?: boolean; label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex flex-col items-center justify-center gap-5", fullScreen ? "min-h-dvh bg-canvas px-4" : "min-h-[60vh]")}
    >
      <Logo variant="stacked" priority className={cn("hvems-loader-pulse", fullScreen ? "w-32" : "w-24")} />
      <div className="relative h-1 w-40 overflow-hidden rounded-full bg-stroke">
        <div className="hvems-loader-bar absolute inset-y-0 w-1/3 rounded-full bg-brand" />
      </div>
      <span className="text-[13px] font-medium text-ink-subtle">{label}…</span>
    </div>
  );
}
