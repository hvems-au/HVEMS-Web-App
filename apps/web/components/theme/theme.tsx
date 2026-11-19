"use client";
import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_KEY as KEY } from "./theme-script";

/**
 * Appearance: Light, Dark or System (follows the device). The choice is kept in
 * this browser (localStorage, per device): HVEMS has no user-preferences store,
 * and appearance doesn't need one. The resolved theme is written to
 * <html data-theme="light|dark"> by THEME_SCRIPT before first paint, so there is
 * no flash, and kept in sync here afterwards (including live device changes).
 */
export type ThemeChoice = "light" | "dark" | "system";
const EVENT = "hvems-theme";


function readChoice(): ThemeChoice {
  try {
    const c = window.localStorage.getItem(KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readChoice() === "system") apply("system");
    onChange();
  };
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
    media.removeEventListener("change", onMedia);
  };
}

export function useTheme() {
  const choice = React.useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  // Another tab changed the choice, or the page loaded: make sure <html> matches.
  React.useEffect(() => apply(choice), [choice]);
  const setChoice = React.useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked (private mode): still switch for this page.
    }
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { choice, setChoice };
}

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Three-way appearance switch (a radio group: arrow keys move between options).
 * `compact` shows icons only, with labels for screen readers and tooltips.
 */
export function ThemeSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { choice, setChoice } = useTheme();
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + OPTIONS.length) % OPTIONS.length;
    setChoice(OPTIONS[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn("inline-flex rounded-[8px] bg-surface-muted p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }, i) => {
        const on = choice === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => setChoice(value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[6px] text-[12.5px] font-medium transition-colors",
              compact ? "size-8" : "h-8 flex-1 px-2.5",
              on ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {compact ? null : label}
          </button>
        );
      })}
    </div>
  );
}
