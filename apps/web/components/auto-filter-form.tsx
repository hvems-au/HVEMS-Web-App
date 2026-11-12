"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A search / filter form that applies itself: typing updates the results after a
 * short pause, and choosing an option or a date applies straight away. No button
 * needed (Enter still works). Values go in the URL, so links, Back and refresh
 * keep them; empty values are left out. Hidden inputs carry the current tab.
 */
/** Lets custom controls (searchable dropdowns) apply a value straight away. */
const AutoFilterContext = React.createContext<((overrides?: Record<string, string>) => void) | null>(null);
export function useAutoFilter() {
  return React.useContext(AutoFilterContext);
}

export function AutoFilterForm({
  action,
  className,
  children,
  id,
  role,
  delay = 300,
}: {
  action?: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
  role?: string;
  delay?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = React.useRef<HTMLFormElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, start] = React.useTransition();

  const apply = React.useCallback((overrides?: Record<string, string>) => {
    clearTimeout(timer.current);
    const form = ref.current;
    if (!form) return;
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (typeof v === "string" && v.trim() !== "") sp.set(k, v.trim());
    }
    for (const [k, v] of Object.entries(overrides ?? {})) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const target = action ?? pathname;
    const qs = sp.toString();
    start(() => router.replace(qs ? `${target}?${qs}` : target, { scroll: false }));
  }, [action, pathname, router]);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form
      ref={ref}
      id={id}
      role={role}
      aria-busy={pending || undefined}
      className={cn(className, pending && "[&_input]:transition-opacity")}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        // Unnamed fields (e.g. the search box inside a searchable dropdown) aren't filters.
        if (!el.name) return;
        const typed = el.tagName === "INPUT" && !["date", "checkbox", "radio", "hidden"].includes(el.type);
        clearTimeout(timer.current);
        if (typed) timer.current = setTimeout(() => apply(), delay);
        else apply();
      }}
    >
      <AutoFilterContext.Provider value={apply}>{children}</AutoFilterContext.Provider>
    </form>
  );
}
