import Image from "next/image";
import { cn } from "@/lib/utils";

type Variant = "stacked" | "horizontal";

/** Supplied HVEMS logo artwork (HVEMS_Logo.pdf), cropped to SVG. `onDark` swaps greys for white. */
export function Logo({
  variant = "stacked",
  onDark = false,
  className,
  priority,
}: {
  variant?: Variant;
  onDark?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const src = `/brand/hvems-logo-${variant}${onDark ? "-on-dark" : ""}.svg`;
  const [w, h] = variant === "stacked" ? [782, 646] : [1012, 300];
  return (
    <Image
      src={src}
      width={w}
      height={h}
      priority={priority}
      alt="HVEMS — Heavy Vehicle & Equipment Management System"
      className={cn("h-auto", className)}
      unoptimized
    />
  );
}
