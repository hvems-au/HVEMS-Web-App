"use client";
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin orange bar at the top of the window from the moment a link is clicked
 * (or a filter form is sent) until the new page arrives, so a click never feels
 * ignored while the server is working.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = `${pathname}?${search.toString()}`;
  // The address we were on when the click happened; the bar hides as soon as it changes.
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const active = leaving === current;
  const currentRef = React.useRef(current);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      setLeaving(currentRef.current);
      clearTimeout(timer);
      // Never leave the bar running if a navigation is abandoned.
      timer = setTimeout(() => setLeaving(null), 15000);
    };
    const here = () => window.location.pathname + window.location.search;
    const onClick = (e: MouseEvent) => {
      // Capture phase: Next.js links cancel the default action before a bubbling listener runs.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname + url.search === here()) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!e.defaultPrevented && form.method.toLowerCase() === "get") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  if (!active) return null;
  return (
    <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-brand/15">
      <div className="h-full w-1/3 animate-[hvems-nav_1.1s_ease-in-out_infinite] bg-brand" />
    </div>
  );
}

export function NavProgress() {
  return (
    <React.Suspense fallback={null}>
      <Bar />
    </React.Suspense>
  );
}
