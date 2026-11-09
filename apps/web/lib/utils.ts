import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function formatNumber(n: number | null | undefined, fractionDigits = 0): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: fractionDigits }).format(n);
}

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
