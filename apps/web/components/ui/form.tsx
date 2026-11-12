import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[6px] border border-stroke bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

/** Native select: accessible on every device (SoW: phones from 360 px) and keyboard-friendly. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        control,
        "h-11 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b5c5d' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[14px] font-medium text-ink-muted", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
      </Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
            "aria-required": required || undefined,
          })
        : children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-danger/30 bg-danger-soft text-danger-ink",
    success: "border-ok/30 bg-ok-soft text-ok-ink",
    info: "border-link/25 bg-info-soft text-info-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-[6px] border px-3 py-2.5 text-[14px]", styles)}>
      {children}
    </div>
  );
}
