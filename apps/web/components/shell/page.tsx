import * as React from "react";
import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href: string };
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <BackLink href={breadcrumb.href} label={breadcrumb.label} />
        ) : null}
        <h1 className="text-[24px] leading-tight font-bold break-words text-ink sm:text-[28px]">{title}</h1>
        {description ? <div className="mt-1 text-[14px] text-ink-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "red" | "amber" | "green";
  href?: string;
}) {
  const iconTone = {
    neutral: "bg-surface-muted text-ink-muted",
    red: "bg-danger-soft text-danger",
    amber: "bg-warn-soft text-warn-ink",
    green: "bg-ok-soft text-ok-ink",
  }[tone];
  const body = (
    <div className="card flex h-full items-center gap-4 px-4 py-4 transition-shadow hover:shadow-md">
      {icon ? <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-6", iconTone)}>{icon}</div> : null}
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-ink-muted">{label}</p>
        <p className="mt-0.5 text-[24px] leading-tight font-bold text-ink">{value}</p>
        {sub ? <p className="mt-0.5 truncate text-[12px] text-ink-subtle">{sub}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[12px] focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
