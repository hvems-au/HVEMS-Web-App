import Image from "next/image";
import { cn } from "@/lib/utils";

type Variant = "stacked" | "horizontal";

const SIZE: Record<Variant, [number, number]> = { stacked: [782, 646], horizontal: [1012, 300] };
const ALT = "HVEMS — Heavy Vehicle & Equipment Management System";

/**
 * Supplied HVEMS logo artwork (HVEMS_Logo.pdf), cropped to SVG; never recoloured.
 * `onDark` true: the supplied white-text version (for the charcoal sidebar).
 * `onDark` false: the charcoal version. Left out: follows the theme, using the
 * charcoal version in Light and the white version in Dark.
 */
export function Logo({ variant = "stacked", onDark, className, priority }: { variant?: Variant; onDark?: boolean; className?: string; priority?: boolean }) {
  const [w, h] = SIZE[variant];
  const img = (dark: boolean, extra?: string) => (
    <Image
      src={`/brand/hvems-logo-${variant}${dark ? "-on-dark" : ""}.svg`}
      width={w}
      height={h}
      priority={priority}
      alt={ALT}
      className={cn("h-auto", className, extra)}
      unoptimized
    />
  );
  if (onDark !== undefined) return img(onDark);
  return (
    <>
      {img(false, "dark:hidden")}
      {img(true, "hidden dark:block")}
    </>
  );
}
