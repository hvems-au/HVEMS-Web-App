import Link from "next/link";
import { cn } from "@/lib/utils";

export type MarketplaceTab = "posted" | "find" | "proposals" | "engagements" | "profile";

/** The company's two sides of the marketplace in one place (decision O-13): jobs it posts, and work it quotes on. */
export function MarketplaceTabs({ orgId, active, canPost, canProvide }: { orgId: string; active: MarketplaceTab; canPost: boolean; canProvide: boolean }) {
  const base = `/customer/${orgId}`;
  const tabs: { key: MarketplaceTab; label: string; href: string; show: boolean }[] = [
    { key: "posted", label: "Our jobs", href: `${base}/marketplace`, show: canPost },
    { key: "find", label: "Find work", href: `${base}/jobs`, show: canProvide },
    { key: "proposals", label: "Our proposals", href: `${base}/jobs?view=mine`, show: canProvide },
    { key: "engagements", label: "Engagements", href: `${base}/engagements`, show: true },
    { key: "profile", label: "Provider profile", href: `${base}/verification`, show: canProvide },
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Marketplace">
      {tabs
        .filter((t) => t.show)
        .map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap",
              active === t.key ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
    </nav>
  );
}
