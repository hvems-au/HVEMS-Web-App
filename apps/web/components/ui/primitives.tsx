import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)}>
      <div>
        <h2 className="text-h6 font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-ink-subtle">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export type BadgeTone = "green" | "amber" | "red" | "blue" | "grey" | "orange";

const badgeTones: Record<BadgeTone, string> = {
  green: "bg-[#e6f6e5] text-[#0a7a00]",
  amber: "bg-warn-soft text-[#9a4a00]",
  red: "bg-danger-soft text-[#c40f10]",
  blue: "bg-[#e8f0fc] text-[#1c5fbd]",
  grey: "bg-surface-muted text-ink-muted",
  orange: "bg-[#fdeee3] text-brand",
};

export function Badge({ tone = "grey", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-[13px]", className)} {...props} />
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-surface-muted text-[13px] font-semibold text-ink-muted" {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("px-4 py-2.5 font-semibold whitespace-nowrap", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-stroke/70 last:border-0", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-ink", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-[#fdeee3] text-brand [&_svg]:size-6">{icon}</div> : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children ? <div className="max-w-md text-[14px] text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} aria-hidden />;
}

export function Dl({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">{i.label}</dt>
          <dd className="mt-1 truncate text-[14px] text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
