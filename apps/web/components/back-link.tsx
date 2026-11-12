import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Back to <parent>" above a page title: a soft pill with a chevron that nudges
 * left on hover. Same look on every portal, light and dark.
 */
export function BackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group mb-3 inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-stroke bg-surface py-1 pr-3.5 pl-1.5 text-[13px] font-medium text-ink-muted shadow-[var(--elev-card)] transition-colors",
        "hover:border-stroke-strong hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
        className,
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-ink transition-transform group-hover:-translate-x-0.5" aria-hidden>
        <ChevronLeft className="size-3.5" strokeWidth={2.5} />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
