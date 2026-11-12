"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[92vh] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
      >
        <div className="mb-4 pr-8">
          <D.Title className="text-[18px] font-semibold text-ink">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-[14px] text-ink-muted">{description}</D.Description> : null}
        </div>
        {children}
        <D.Close className="absolute top-4 right-4 rounded-md p-1 text-ink-muted hover:bg-surface-muted" aria-label="Close">
          <X className="size-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
