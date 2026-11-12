"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Workspace tabs. The current section is marked for screen readers and visually. */
export function OperatorTabs({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/driver/o/${orgId}`;
  const tabs = [
    { href: base, label: "Home", match: (p: string) => p === base },
    { href: `${base}/equipment`, label: "Vehicles & equipment", match: (p: string) => p.startsWith(`${base}/equipment`) },
    { href: `${base}/prestarts`, label: "My pre-starts", match: (p: string) => p.startsWith(`${base}/prestarts`) },
    { href: `${base}/issues`, label: "My issues", match: (p: string) => p.startsWith(`${base}/issues`) },
  ];
  return (
    <nav aria-label="Operator workspace" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stroke px-4">
      {tabs.map((t) => {
        const on = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-medium whitespace-nowrap",
              on ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
