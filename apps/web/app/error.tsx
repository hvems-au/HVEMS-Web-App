"use client";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-[20px] font-bold text-ink-muted">Something went wrong</h1>
      <p className="max-w-md text-[14px] text-ink-subtle">The error has been recorded. Try again, and contact HVEMS support if it keeps happening.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
